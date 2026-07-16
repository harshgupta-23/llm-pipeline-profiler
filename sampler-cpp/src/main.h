#ifndef MAIN_H
#define MAIN_H

#include <string>

// Public C++ APIs to start/stop the background sampling thread
void start_sampler(const std::string& socket_path, int interval_ms);
void stop_sampler();

#endif // MAIN_H
