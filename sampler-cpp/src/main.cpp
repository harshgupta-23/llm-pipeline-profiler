#include "main.h"
#include "proc_reader.h"
#include "nvml_reader.h"
#include "ipc_server.h"

#include <iostream>
#include <thread>
#include <atomic>
#include <chrono>
#include <iomanip>
#include <sstream>

static std::atomic<bool> sampler_running(false);
static std::thread* sampler_thread = nullptr;

void sampler_loop(std::string socket_path, int interval_ms) {
#ifdef _WIN32
    std::cout << "[sampler-cpp] Starting background thread. Running on Windows: CPU/GPU metrics return 0.0 (by design)." << std::endl;
#else
    std::cout << "[sampler-cpp] Starting background thread on Linux. Socket path: " << socket_path << std::endl;
#endif

    ProcReader proc_reader;
    NVMLReader nvml_reader;
    IPCServer ipc_server;

    if (!ipc_server.start(socket_path)) {
        std::cerr << "[sampler-cpp] IPC server failed to start. Exiting sampler loop." << std::endl;
        return;
    }

    while (sampler_running) {
        auto start_time = std::chrono::steady_clock::now();

        // 1. Get formatted ISO 8601 timestamp in UTC
        auto now = std::chrono::system_clock::now();
        auto time_t_now = std::chrono::system_clock::to_time_t(now);
        auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()) % 1000;
        
        std::stringstream ss;
        ss << std::put_time(std::gmtime(&time_t_now), "%Y-%m-%dT%H:%M:%S")
           << '.' << std::setfill('0') << std::setw(3) << ms.count() << 'Z';
        std::string timestamp = ss.str();

        // 2. Read metrics
        proc_reader.update();
        nvml_reader.update();

        // 3. Serialize and push if we have clients
        if (ipc_server.has_clients()) {
            std::stringstream json;
            json << "{"
                 << "\"timestamp\": \"" << timestamp << "\","
                 << "\"cpu_percent\": " << proc_reader.get_cpu_percent() << ","
                 << "\"ram_used_mb\": " << proc_reader.get_ram_used_mb() << ","
                 << "\"gpu_util_percent\": " << nvml_reader.get_gpu_util_percent() << ","
                 << "\"gpu_mem_used_mb\": " << nvml_reader.get_gpu_mem_used_mb()
                 << "}";
            
            ipc_server.send_message(json.str());
        }

        // 4. Calculate sleep adjustment to handle loop drift
        auto end_time = std::chrono::steady_clock::now();
        auto elapsed_ms = std::chrono::duration_cast<std::chrono::milliseconds>(end_time - start_time).count();
        long long sleep_duration = interval_ms - elapsed_ms;

        if (sleep_duration > 0) {
            std::this_thread::sleep_for(std::chrono::milliseconds(sleep_duration));
        }
    }

    ipc_server.stop();
    std::cout << "[sampler-cpp] Background sampling thread stopped cleanly." << std::endl;
}

void start_sampler(const std::string& socket_path, int interval_ms) {
    if (sampler_running) {
        return;
    }
    sampler_running = true;
    sampler_thread = new std::thread(sampler_loop, socket_path, interval_ms);
}

void stop_sampler() {
    if (!sampler_running) {
        return;
    }
    sampler_running = false;
    if (sampler_thread) {
        if (sampler_thread->joinable()) {
            sampler_thread->join();
        }
        delete sampler_thread;
        sampler_thread = nullptr;
    }
}
