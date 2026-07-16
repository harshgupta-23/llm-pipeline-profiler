# LLM Pipeline Profiler — C++ Sampler

This directory contains the high-frequency system sampler written in C++. It collects CPU, RAM, GPU, and VRAM utilization metrics and exposes them over a Unix domain socket to the Python tracer.

---

## 1. Standalone Compilation (CMake)

You can build this component as a standalone executable independent of Python and PyTorch. 

### Prerequisites
* A C++11 compliant compiler (GCC, Clang, or MSVC)
* CMake 3.10 or higher

### Build Instructions
Run the following commands from this directory:

```bash
# Configure the build directory
cmake -B build

# Build the executable
cmake --build build --config Release
```

The resulting executable `llm_profiler_sampler` (or `llm_profiler_sampler.exe` on Windows) will be located inside the `build/` (or `build/Release/`) folder.

### Running the Standalone Executable
You can start the sampler directly from the command line:

```bash
# Run with default socket path (llm_profiler_sampler.sock) and 50ms interval
./llm_profiler_sampler

# Run with custom socket path and 20ms interval
./llm_profiler_sampler /tmp/custom_sampler.sock 20
```

* **Windows local development:** The socket and OS-level readings are stubbed by design (returning `0.0` values), allowing you to build and test the architecture locally.
* **Linux / Kaggle environments:** The executable runs the real Linux system calls and loads NVML dynamically to fetch active CPU and GPU utilization metrics.

---

## 2. Python Extension Integration

For integration with the Python package, this C++ code is built automatically as a Python extension module (`llm_profiler_sampler`) using `setup.py` during `pip install ./profiler-lib`. 

You do **not** need to run the CMake commands manually if you are using it through the Python package. The CMake target is an additional, standalone build path for development and testing.
