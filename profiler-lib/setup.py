import os
import sys
from setuptools import setup, Extension
from setuptools.command.build_ext import build_ext

# Custom build class to catch compiler failures and print a warning
class BuildExtSafe(build_ext):
    def run(self):
        try:
            super().run()
        except Exception as e:
            self._print_fallback_warning(e)

    def build_extension(self, ext):
        try:
            super().build_extension(ext)
        except Exception as e:
            self._print_fallback_warning(e)

    def _print_fallback_warning(self, error):
        print("\n" + "="*75)
        print("WARNING: C++ extension compilation failed!")
        print(f"Error: {error}")
        print("LLM Pipeline Profiler will fall back to the pure-Python system sampler.")
        print("="*75 + "\n")

# Attempt to configure C++ Extension using pybind11
ext_modules = []
cmdclass = {}

try:
    from pybind11.setup_helpers import Pybind11Extension
    
    # We compile the bindings module from sampler-cpp source files
    ext_modules = [
        Pybind11Extension(
            "llm_profiler_sampler",
            sources=[
                "../sampler-cpp/bindings/pybind_wrapper.cpp",
                "../sampler-cpp/src/proc_reader.cpp",
                "../sampler-cpp/src/nvml_reader.cpp",
                "../sampler-cpp/src/ipc_server.cpp",
                "../sampler-cpp/src/main.cpp",
            ],
            include_dirs=["../sampler-cpp/src"],
            cxx_std=11,
        )
    ]
    cmdclass = {"build_ext": BuildExtSafe}
except ImportError:
    print("\n" + "="*75)
    print("WARNING: pybind11 is not installed in the build environment.")
    print("LLM Pipeline Profiler will be installed without the C++ sampler extension.")
    print("="*75 + "\n")

setup(
    ext_modules=ext_modules,
    cmdclass=cmdclass,
)
