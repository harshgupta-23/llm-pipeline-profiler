#include <pybind11/pybind11.h>
#include "main.h"

namespace py = pybind11;

PYBIND11_MODULE(llm_profiler_sampler, m) {
    m.doc() = "C++ high-frequency system resources sampler extension for LLM Pipeline Profiler";
    m.def("start_sampler", &start_sampler, "Start background C++ resource sampler thread",
          py::arg("socket_path"), py::arg("interval_ms"));
    m.def("stop_sampler", &stop_sampler, "Stop background C++ resource sampler thread");
}
