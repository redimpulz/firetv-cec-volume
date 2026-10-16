cmake_minimum_required(VERSION 3.15)

project(adbshell
        VERSION 1.0
        LANGUAGES CXX C)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Fail at compile time for unresolved symbols. This can catch cases
# where we forget to add .cpp files to the CMake target shared object
# library. If your use case requires dynamic symbol linking, remove
# these lines.
if(CMAKE_CXX_COMPILER_ID MATCHES "Clang")
  add_link_options("LINKER:--no-undefined" "LINKER:-z,defs")
endif()

if (CMAKE_SYSTEM_NAME STREQUAL Android)
  add_compile_definitions(ANDROID)
endif()

set(HEADERS
  kepler/turbo-modules/generated/adbshellSpec.h
  kepler/turbo-modules/adbshell.h
)
set(SOURCES
    kepler/turbo-modules/generated/adbshellSpec.cpp
    kepler/turbo-modules/adbshell.cpp
    kepler/AutoLinkInit.cpp
)

find_package(turbomoduleAPI CONFIG REQUIRED)

kepler_add_turbo_module_library(adbshell SHARED ${HEADERS} ${SOURCES})

if (CMAKE_SYSTEM_NAME STREQUAL Android)
    list(APPEND LIBRARIES
        android log)
endif()
target_link_libraries(adbshell PRIVATE ${LIBRARIES})

install(TARGETS adbshell)
