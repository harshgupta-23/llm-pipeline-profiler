#ifndef IPC_SERVER_H
#define IPC_SERVER_H

#include <string>
#include <vector>

#ifdef _WIN32
// Minimal Windows socket types to avoid winsock conflicts
typedef unsigned int SOCKET_TYPE;
#else
typedef int SOCKET_TYPE;
#endif

class IPCServer {
public:
    IPCServer();
    ~IPCServer();
    bool start(const std::string& socket_path);
    void stop();
    void send_message(const std::string& msg);
    bool has_clients();

private:
    std::string socket_path_;
    SOCKET_TYPE server_fd_;
    std::vector<SOCKET_TYPE> client_fds_;
    bool running_;

    void accept_clients_loop();
#ifndef _WIN32
    pthread_t accept_thread_;
#else
    void* accept_thread_;
#endif
};

#endif // IPC_SERVER_H
