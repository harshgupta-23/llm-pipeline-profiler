#include "nvml_reader.h"
#include <iostream>

#ifdef __linux__
#include <dlfcn.h>

// Define NVML types and signatures manually to avoid CUDA Toolkit compile-time dependencies
typedef int nvmlReturn_t;
typedef struct nvmlDevice_st* nvmlDevice_t;

typedef struct {
    unsigned int device; // GPU kernel utilization
    unsigned int memory; // VRAM bandwidth utilization
} nvmlUtilization_t;

typedef struct {
    unsigned long long total;
    unsigned long long free;
    unsigned long long used;
} nvmlMemory_t;

typedef nvmlReturn_t (*nvmlInit_t)();
typedef nvmlReturn_t (*nvmlShutdown_t)();
typedef nvmlReturn_t (*nvmlDeviceGetHandleByIndex_t)(unsigned int, nvmlDevice_t*);
typedef nvmlReturn_t (*nvmlDeviceGetUtilizationRates_t)(nvmlDevice_t, nvmlUtilization_t*);
typedef nvmlReturn_t (*nvmlDeviceGetMemoryInfo_t)(nvmlDevice_t, nvmlMemory_t*);

static nvmlInit_t fn_nvmlInit = nullptr;
static nvmlShutdown_t fn_nvmlShutdown = nullptr;
static nvmlDeviceGetHandleByIndex_t fn_nvmlDeviceGetHandleByIndex = nullptr;
static nvmlDeviceGetUtilizationRates_t fn_nvmlDeviceGetUtilizationRates = nullptr;
static nvmlDeviceGetMemoryInfo_t fn_nvmlDeviceGetMemoryInfo = nullptr;

static nvmlDevice_t device_handle = nullptr;
#endif

NVMLReader::NVMLReader() : enabled_(false), gpu_util_percent_(0.0), gpu_mem_used_mb_(0.0) {
#ifdef __linux__
    nvml_lib_ = dlopen("libnvidia-ml.so.1", RTLD_LAZY);
    if (!nvml_lib_) {
        nvml_lib_ = dlopen("libnvidia-ml.so", RTLD_LAZY);
    }

    if (nvml_lib_) {
        fn_nvmlInit = (nvmlInit_t)dlsym(nvml_lib_, "nvmlInit");
        fn_nvmlShutdown = (nvmlShutdown_t)dlsym(nvml_lib_, "nvmlShutdown");
        fn_nvmlDeviceGetHandleByIndex = (nvmlDeviceGetHandleByIndex_t)dlsym(nvml_lib_, "nvmlDeviceGetHandleByIndex");
        fn_nvmlDeviceGetUtilizationRates = (nvmlDeviceGetUtilizationRates_t)dlsym(nvml_lib_, "nvmlDeviceGetUtilizationRates");
        fn_nvmlDeviceGetMemoryInfo = (nvmlDeviceGetMemoryInfo_t)dlsym(nvml_lib_, "nvmlDeviceGetMemoryInfo");

        if (fn_nvmlInit && fn_nvmlShutdown && fn_nvmlDeviceGetHandleByIndex &&
            fn_nvmlDeviceGetUtilizationRates && fn_nvmlDeviceGetMemoryInfo) {
            
            if (fn_nvmlInit() == 0) { // NVML_SUCCESS is 0
                if (fn_nvmlDeviceGetHandleByIndex(0, &device_handle) == 0) {
                    enabled_ = true;
                } else {
                    fn_nvmlShutdown();
                }
            }
        }
    }
#else
    // Windows fallback: NVML stays disabled by design
#endif
}

NVMLReader::~NVMLReader() {
#ifdef __linux__
    if (enabled_ && fn_nvmlShutdown) {
        fn_nvmlShutdown();
    }
    if (nvml_lib_) {
        dlclose(nvml_lib_);
    }
#endif
}

void NVMLReader::update() {
    if (!enabled_) {
        gpu_util_percent_ = 0.0;
        gpu_mem_used_mb_ = 0.0;
        return;
    }

#ifdef __linux__
    nvmlUtilization_t rates;
    if (fn_nvmlDeviceGetUtilizationRates(device_handle, &rates) == 0) {
        gpu_util_percent_ = static_cast<double>(rates.device);
    }

    nvmlMemory_t mem;
    if (fn_nvmlDeviceGetMemoryInfo(device_handle, &mem) == 0) {
        gpu_mem_used_mb_ = static_cast<double>(mem.used) / (1024.0 * 1024.0);
    }
#endif
}

double NVMLReader::get_gpu_util_percent() const {
    return gpu_util_percent_;
}

double NVMLReader::get_gpu_mem_used_mb() const {
    return gpu_mem_used_mb_;
}
