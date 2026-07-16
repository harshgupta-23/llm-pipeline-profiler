#include "proc_reader.h"
#include <iostream>
#include <fstream>
#include <sstream>
#include <string>

#ifdef __linux__
#include <unistd.h>
#include <sys/sysinfo.h>
#endif

ProcReader::ProcReader() : cpu_percent_(0.0), ram_used_mb_(0.0) {
#ifdef __linux__
    last_work_time_ = 0;
    last_total_time_ = 0;
    last_proc_time_ = 0;
    update();
#else
    // Windows/Local fallback by design: CPU and RAM measurements return 0.0
#endif
}

void ProcReader::update() {
#ifdef __linux__
    // 1. Read RAM usage from /proc/self/status (VmRSS)
    std::ifstream status_file("/proc/self/status");
    std::string line;
    double rss_kb = 0.0;
    while (std::getline(status_file, line)) {
        if (line.rfind("VmRSS:", 0) == 0) {
            std::stringstream ss(line.substr(6));
            ss >> rss_kb;
            break;
        }
    }
    ram_used_mb_ = rss_kb / 1024.0;

    // 2. Read System CPU times from /proc/stat
    std::ifstream stat_file("/proc/stat");
    std::getline(stat_file, line);
    std::stringstream ss(line);
    std::string cpu_label;
    ss >> cpu_label;
    
    unsigned long long user, nice, system, idle, iowait, irq, softirq, steal;
    if (ss >> user >> nice >> system >> idle >> iowait >> irq >> softirq >> steal) {
        unsigned long long work_time = user + nice + system + irq + softirq + steal;
        unsigned long long total_time = work_time + idle + iowait;

        // 3. Read Process CPU time from /proc/self/stat
        std::ifstream proc_stat_file("/proc/self/stat");
        std::string proc_line;
        std::getline(proc_stat_file, proc_line);
        std::stringstream pss(proc_line);
        std::string dummy;
        for (int i = 0; i < 13; ++i) pss >> dummy;
        
        unsigned long long utime, stime;
        if (pss >> utime >> stime) {
            unsigned long long proc_time = utime + stime;

            if (last_total_time_ > 0 && total_time > last_total_time_) {
                double total_diff = static_cast<double>(total_time - last_total_time_);
                double proc_diff = static_cast<double>(proc_time - last_proc_time_);
                
                // Scale CPU usage by number of cores
                long num_cores = sysconf(_SC_NPROCESSORS_ONLN);
                cpu_percent_ = (proc_diff / total_diff) * 100.0 * num_cores;
            }

            last_work_time_ = work_time;
            last_total_time_ = total_time;
            last_proc_time_ = proc_time;
        }
    }
#else
    // Windows/Local fallback: do nothing, variables remain 0.0
    cpu_percent_ = 0.0;
    ram_used_mb_ = 0.0;
#endif
}

double ProcReader::get_cpu_percent() {
    return cpu_percent_;
}

double ProcReader::get_ram_used_mb() {
    return ram_used_mb_;
}
