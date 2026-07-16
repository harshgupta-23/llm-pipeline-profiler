#include "ipc_server.h"
#include <iostream>
#include <thread>
#include <mutex>
#include <algorithm>

#ifndef _WIN32
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>
#include <fcntl.h>
#endif

// Mutex for client FD array operations
static std::mutex clients_mutex;

IPCServer::IPCServer() : server_fd_(-1), running_(false), accept_thread_(nullptr) {}

IPCServer::~IPCServer() {
    stop();
}

#ifndef _WIN32
// Real Linux Implementation
bool IPCServer::start(const std::string& socket_path) {
    socket_path_ = socket_path;
    running_ = true;

    // Remove existing socket file if any
    unlink(socket_path.c_str());

    server_fd_ = socket(AF_UNIX, SOCK_STREAM, 0);
    if (server_fd_ < 0) {
        std::cerr << "[sampler-cpp] Failed to create socket." << std::endl;
        return false;
    }

    // Set non-blocking to allow clean shutdown
    int flags = fcntl(server_fd_, F_GETFL, 0);
    fcntl(server_fd_, F_SETFL, flags | O_NONBLOCK);

    sockaddr_un addr;
    memset(&addr, 0, sizeof(addr));
    addr.sun_family = AF_UNIX;
    strncpy(addr.sun_path, socket_path.c_str(), sizeof(addr.sun_path) - 1);

    if (bind(server_fd_, (struct sockaddr*)&addr, sizeof(addr)) < 0) {
        std::cerr << "[sampler-cpp] Failed to bind socket to path: " << socket_path << std::endl;
        close(server_fd_);
        server_fd_ = -1;
        return false;
    }

    if (listen(server_fd_, 5) < 0) {
        std::cerr << "[sampler-cpp] Failed to listen on socket." << std::endl;
        close(server_fd_);
        server_fd_ = -1;
        return false;
    }

    // Start accept thread
    accept_thread_ = new std::thread(&IPCServer::accept_clients_loop, this);
    return true;
}

void IPCServer::accept_clients_loop() {
    while (running_) {
        sockaddr_un client_addr;
        socklen_t client_len = sizeof(client_addr);
        int client_fd = accept(server_fd_, (struct sockaddr*)&client_addr, &client_len);
        
        if (client_fd >= 0) {
            std::lock_guard<std::mutex> lock(clients_mutex);
            client_fds_.push_back(client_fd);
        } else {
            // Sleep briefly when no client is waiting (since it's non-blocking)
            std::this_thread::sleep_for(std::chrono::milliseconds(50));
        }
    }
}

void IPCServer::stop() {
    running_ = false;
    
    if (accept_thread_) {
        if (accept_thread_->joinable()) {
            accept_thread_->join();
        }
        delete accept_thread_;
        accept_thread_ = nullptr;
    }

    std::lock_guard<std::mutex> lock(clients_mutex);
    for (int fd : client_fds_) {
        if (fd >= 0) close(fd);
    }
    client_fds_.clear();

    if (server_fd_ >= 0) {
        close(server_fd_);
        server_fd_ = -1;
    }

    if (!socket_path_.empty()) {
        unlink(socket_path_.c_str());
        socket_path_.clear();
    }
}

void IPCServer::send_message(const std::string& msg) {
    std::lock_guard<std::mutex> lock(clients_mutex);
    std::vector<int> active_clients;

    for (int fd : client_fds_) {
        if (fd < 0) continue;
        
        // Write trailing newline for line-oriented reading
        std::string packet = msg + "\n";
        ssize_t sent = write(fd, packet.c_str(), packet.length());
        
        if (sent >= 0) {
            active_clients.push_back(fd);
        } else {
            // Client disconnected or errored
            close(fd);
        }
    }
    client_fds_ = active_clients;
}

bool IPCServer::has_clients() {
    std::lock_guard<std::mutex> lock(clients_mutex);
    return !client_fds_.empty();
}

#else
// Windows Stub Implementation
bool IPCServer::start(const std::string& socket_path) {
    socket_path_ = socket_path;
    running_ = false;
    std::cout << "[sampler-cpp] Socket server stubbed on Windows (Pure-Python fallback active)." << std::endl;
    return false;
}

void IPCServer::accept_clients_loop() {}

void IPCServer::stop() {}

void IPCServer::send_message(const std::string& msg) {}

bool IPCServer::has_clients() {
    return false;
}
#endif
