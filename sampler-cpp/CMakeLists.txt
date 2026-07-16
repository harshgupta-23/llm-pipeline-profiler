cmake_minimum_required(VERSION 3.10)
project(sampler_cpp CXX)

set(CMAKE_CXX_STANDARD 11)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Add source files
set(SOURCES
    src/proc_reader.cpp
    src/nvml_reader.cpp
    src/ipc_server.cpp
    src/main.cpp
    src/standalone_main.cpp
)

# Header search paths
include_directories(src)

# Create standalone executable target
add_executable(llm_profiler_sampler_bin ${SOURCES})

# Windows and Linux specific configurations
if(WIN32)
    # Windows doesn't require extra dynamic linking for stub functions
    # However, we can add standard thread link library
    find_package(Threads REQUIRED)
    target_link_libraries(llm_profiler_sampler_bin PRIVATE Threads::Threads)
else()
    # On Linux, NVML uses dlopen/dlsym/dlclose, so we need to link with libdl
    find_package(Threads REQUIRED)
    target_link_libraries(llm_profiler_sampler_bin PRIVATE dl Threads::Threads)
endif()

# Set output name to something descriptive
set_target_properties(llm_profiler_sampler_bin PROPERTIES OUTPUT_NAME llm_profiler_sampler)
