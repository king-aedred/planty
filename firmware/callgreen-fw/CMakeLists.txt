# The following five lines of boilerplate have to be in your project's
# CMakeLists in this exact order for cmake to work correctly
cmake_minimum_required(VERSION 3.22)

# PoP liegt in der (ignorierten) sdkconfig.defaults.local
set(SDKCONFIG_DEFAULTS "sdkconfig.defaults")
if(EXISTS "${CMAKE_CURRENT_LIST_DIR}/sdkconfig.defaults.local")
    list(APPEND SDKCONFIG_DEFAULTS "sdkconfig.defaults.local")
endif()

# Firmware-Version: einzige Quelle (App-Header, fw_version in allen Requests, OTA-Pruefung)
set(PROJECT_VER "7.0.5")

include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(callgreen_fw)
