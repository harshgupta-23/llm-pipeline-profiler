#ifndef PROC_READER_H
#define PROC_READER_H

class ProcReader {
public:
    ProcReader();
    void update();
    double get_cpu_percent();
    double get_ram_used_mb();

private:
    double cpu_percent_;
    double ram_used_mb_;

#ifdef __linux__
    unsigned long long last_work_time_;
    unsigned long long last_total_time_;
    unsigned long long last_proc_time_;
#endif
};

#endif // PROC_READER_H
