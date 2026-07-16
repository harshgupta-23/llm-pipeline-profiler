#ifndef NVML_READER_H
#define NVML_READER_H

class NVMLReader {
public:
    NVMLReader();
    ~NVMLReader();
    void update();
    bool is_enabled() const;
    double get_gpu_util_percent() const;
    double get_gpu_mem_used_mb() const;

private:
    bool enabled_;
    double gpu_util_percent_;
    double gpu_mem_used_mb_;

#ifdef __linux__
    void* nvml_lib_;
#endif
};

#endif // NVML_READER_H
