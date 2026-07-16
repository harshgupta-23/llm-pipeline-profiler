#include "main.h"
#include <iostream>
#include <string>
#include <chrono>
#include <thread>
#include <csignal>
#include <atomic>

// Global flag to stop the program
static std::atomic<bool> keep_running(true);

static void signal_handler(int signal) {
    if (signal == SIGINT || signal == SIGTERM) {
        keep_running = false;
    }
}

int main(int argc, char* argv[]) {
    // Default values
    std::string socket_path = "llm_profiler_sampler.sock";
    int interval_ms = 50;

    // Basic arg parsing
    if (argc > 1) {
        socket_path = argv[1];
    }
    if (argc > 2) {
        try {
            interval_ms = std::stoi(argv[2]);
        } catch (...) {
            std::cerr << "[sampler-cpp] Invalid interval argument, using default 50ms" << std::endl;
        }
    }

    std::cout << "[sampler-cpp] Starting standalone sampler..." << std::endl;
    std::cout << "[sampler-cpp] Socket path: " << socket_path << std::endl;
    std::cout << "[sampler-cpp] Sample interval: " << interval_ms << "ms" << std::endl;
    std::cout << "[sampler-cpp] Press Ctrl+C to stop." << std::endl;

    // Register signal handlers for clean shutdown
    std::signal(SIGINT, signal_handler);
    std::signal(SIGTERM, signal_handler);

    start_sampler(socket_path, interval_ms);

    // Keep main thread alive until signal received
    while (keep_running) {
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }

    std::cout << "[sampler-cpp] Signal received. Stopping standalone sampler..." << std::endl;
    stop_sampler();
    std::cout << "[sampler-cpp] Standalone sampler exited cleanly." << std::endl;
    
    return 0;
}
