#include <node_api.h>
#include <windows.h>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstdint>
#include <cstring>
#include <string>
#include <thread>

namespace {

struct libvlc_instance_t;
struct libvlc_media_t;
struct libvlc_media_player_t;
using libvlc_time_t = int64_t;

enum libvlc_state_t {
  libvlc_NothingSpecial = 0,
  libvlc_Opening,
  libvlc_Buffering,
  libvlc_Playing,
  libvlc_Paused,
  libvlc_Stopped,
  libvlc_Ended,
  libvlc_Error
};

enum libvlc_media_slave_type_t {
  libvlc_media_slave_type_subtitle = 0,
  libvlc_media_slave_type_audio = 1
};

struct VlcApi {
  HMODULE coreLibrary = nullptr;
  HMODULE library = nullptr;
  libvlc_instance_t* (__cdecl *newInstance)(int, const char* const*) = nullptr;
  void (__cdecl *releaseInstance)(libvlc_instance_t*) = nullptr;
  libvlc_media_t* (__cdecl *newLocation)(libvlc_instance_t*, const char*) = nullptr;
  void (__cdecl *addOption)(libvlc_media_t*, const char*) = nullptr;
  void (__cdecl *releaseMedia)(libvlc_media_t*) = nullptr;
  libvlc_media_player_t* (__cdecl *newPlayer)(libvlc_instance_t*) = nullptr;
  void (__cdecl *releasePlayer)(libvlc_media_player_t*) = nullptr;
  void (__cdecl *setMedia)(libvlc_media_player_t*, libvlc_media_t*) = nullptr;
  void (__cdecl *setHwnd)(libvlc_media_player_t*, void*) = nullptr;
  int (__cdecl *play)(libvlc_media_player_t*) = nullptr;
  void (__cdecl *setPause)(libvlc_media_player_t*, int) = nullptr;
  void (__cdecl *stop)(libvlc_media_player_t*) = nullptr;
  libvlc_state_t (__cdecl *getState)(libvlc_media_player_t*) = nullptr;
  libvlc_time_t (__cdecl *getTime)(libvlc_media_player_t*) = nullptr;
  int (__cdecl *setTime)(libvlc_media_player_t*, libvlc_time_t) = nullptr;
  libvlc_time_t (__cdecl *getLength)(libvlc_media_player_t*) = nullptr;
  int (__cdecl *addSlave)(libvlc_media_player_t*, libvlc_media_slave_type_t, const char*, bool) = nullptr;
  int (__cdecl *getSubtitleTrack)(libvlc_media_player_t*) = nullptr;
  int (__cdecl *setSubtitleTrack)(libvlc_media_player_t*, int) = nullptr;
  int (__cdecl *getVolume)(libvlc_media_player_t*) = nullptr;
  int (__cdecl *setVolume)(libvlc_media_player_t*, int) = nullptr;
};

VlcApi api;
libvlc_instance_t* instance = nullptr;
libvlc_media_player_t* player = nullptr;
HWND parentWindow = nullptr;
HWND videoWindow = nullptr;
std::string lastError;
std::atomic<uint64_t> subtitleCommandGeneration{0};

#define LOAD_VLC(symbol, field) \
  api.field = reinterpret_cast<decltype(api.field)>(GetProcAddress(api.library, symbol)); \
  if (!api.field) { lastError = std::string("Missing libVLC symbol: ") + symbol; return false; }

std::string stringArg(napi_env env, napi_value value) {
  size_t size = 0;
  napi_get_value_string_utf8(env, value, nullptr, 0, &size);
  std::string result(size, '\0');
  napi_get_value_string_utf8(env, value, result.data(), size + 1, &size);
  return result;
}

std::wstring wideString(const std::string& value) {
  if (value.empty()) return {};
  const int size = MultiByteToWideChar(CP_UTF8, 0, value.c_str(), -1, nullptr, 0);
  std::wstring result(static_cast<size_t>(size), L'\0');
  MultiByteToWideChar(CP_UTF8, 0, value.c_str(), -1, result.data(), size);
  result.resize(result.empty() ? 0 : result.size() - 1);
  return result;
}

std::string windowsError(const char* fallback) {
  const DWORD code = GetLastError();
  char* message = nullptr;
  FormatMessageA(FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS,
    nullptr, code, MAKELANGID(LANG_NEUTRAL, SUBLANG_DEFAULT), reinterpret_cast<char*>(&message), 0, nullptr);
  const std::string result = message ? message : fallback;
  if (message) LocalFree(message);
  return result;
}

napi_value jsString(napi_env env, const std::string& value) {
  napi_value result;
  napi_create_string_utf8(env, value.c_str(), value.size(), &result);
  return result;
}

napi_value jsBoolean(napi_env env, bool value) {
  napi_value result;
  napi_get_boolean(env, value, &result);
  return result;
}

void setNamedNumber(napi_env env, napi_value object, const char* name, double value) {
  napi_value number;
  napi_create_double(env, value, &number);
  napi_set_named_property(env, object, name, number);
}

void setNamedBoolean(napi_env env, napi_value object, const char* name, bool value) {
  napi_set_named_property(env, object, name, jsBoolean(env, value));
}

void setNamedString(napi_env env, napi_value object, const char* name, const std::string& value) {
  napi_set_named_property(env, object, name, jsString(env, value));
}

HWND nativeWindowFromBuffer(napi_env env, napi_value value) {
  bool isBuffer = false;
  napi_is_buffer(env, value, &isBuffer);
  if (!isBuffer) return nullptr;
  void* data = nullptr;
  size_t length = 0;
  napi_get_buffer_info(env, value, &data, &length);
  if (!data || length < sizeof(HWND)) return nullptr;
  HWND handle = nullptr;
  std::memcpy(&handle, data, sizeof(HWND));
  return IsWindow(handle) ? handle : nullptr;
}

void resizeVideoWindow() {
  if (!parentWindow || !videoWindow) return;
  RECT bounds{};
  if (!GetClientRect(parentWindow, &bounds)) return;
  SetWindowPos(videoWindow, HWND_BOTTOM, 0, 0, bounds.right - bounds.left, bounds.bottom - bounds.top,
    SWP_NOACTIVATE | SWP_SHOWWINDOW);
  // libVLC only owns the pixels inside the decoded picture. Repaint the
  // parent surface so the remaining aspect-ratio bars never inherit the
  // transparent Electron desktop background.
  RedrawWindow(videoWindow, nullptr, nullptr, RDW_INVALIDATE | RDW_ERASE | RDW_UPDATENOW);
}

LRESULT CALLBACK videoSurfaceWindowProc(HWND window, UINT message, WPARAM wParam, LPARAM lParam) {
  if (message == WM_ERASEBKGND) {
    RECT bounds{};
    GetClientRect(window, &bounds);
    FillRect(reinterpret_cast<HDC>(wParam), &bounds, static_cast<HBRUSH>(GetStockObject(BLACK_BRUSH)));
    return 1;
  }
  if (message == WM_PAINT) {
    PAINTSTRUCT paint{};
    HDC context = BeginPaint(window, &paint);
    FillRect(context, &paint.rcPaint, static_cast<HBRUSH>(GetStockObject(BLACK_BRUSH)));
    EndPaint(window, &paint);
    return 0;
  }
  return DefWindowProcW(window, message, wParam, lParam);
}

bool attachVideoWindow(HWND parent) {
  static bool classRegistered = false;
  const wchar_t* className = L"PrismVlcVideoSurface";
  const HINSTANCE module = GetModuleHandleW(nullptr);
  if (!classRegistered) {
    WNDCLASSEXW windowClass{};
    windowClass.cbSize = sizeof(windowClass);
    windowClass.lpfnWndProc = videoSurfaceWindowProc;
    windowClass.hInstance = module;
    windowClass.hCursor = LoadCursorW(nullptr, MAKEINTRESOURCEW(32512));
    windowClass.hbrBackground = static_cast<HBRUSH>(GetStockObject(BLACK_BRUSH));
    windowClass.lpszClassName = className;
    if (!RegisterClassExW(&windowClass) && GetLastError() != ERROR_CLASS_ALREADY_EXISTS) {
      lastError = windowsError("PRISM could not register its video surface.");
      return false;
    }
    classRegistered = true;
  }

  if (videoWindow && parentWindow != parent) {
    DestroyWindow(videoWindow);
    videoWindow = nullptr;
  }
  parentWindow = parent;
  if (!videoWindow) {
    videoWindow = CreateWindowExW(WS_EX_NOACTIVATE | WS_EX_TRANSPARENT, className, L"",
      WS_CHILD | WS_CLIPSIBLINGS | WS_CLIPCHILDREN, 0, 0, 1, 1, parent, nullptr, module, nullptr);
    if (!videoWindow) {
      lastError = windowsError("PRISM could not create its video surface.");
      return false;
    }
  }
  resizeVideoWindow();
  return true;
}

bool loadRuntime(const std::string& libraryPath, const std::string& pluginPath,
  const std::string& subtitleColor = "16777215", const std::string& subtitleSize = "16",
  const std::string& subtitleBackground = "120") {
  if (instance) return true;
  const std::wstring wideLibraryPath = wideString(libraryPath);
  const size_t separator = wideLibraryPath.find_last_of(L"\\/");
  const std::wstring runtimeDirectory = separator == std::wstring::npos ? L"" : wideLibraryPath.substr(0, separator);
  const std::wstring corePath = runtimeDirectory + L"\\libvlccore.dll";
  SetDllDirectoryW(runtimeDirectory.c_str());
  _putenv_s("VLC_PLUGIN_PATH", pluginPath.c_str());

  api.coreLibrary = LoadLibraryW(corePath.c_str());
  if (!api.coreLibrary) {
    lastError = windowsError("Could not load the libVLC core.");
    return false;
  }
  api.library = LoadLibraryW(wideLibraryPath.c_str());
  if (!api.library) {
    lastError = windowsError("Could not load libVLC.");
    return false;
  }
  LOAD_VLC("libvlc_new", newInstance);
  LOAD_VLC("libvlc_release", releaseInstance);
  LOAD_VLC("libvlc_media_new_location", newLocation);
  LOAD_VLC("libvlc_media_add_option", addOption);
  LOAD_VLC("libvlc_media_release", releaseMedia);
  LOAD_VLC("libvlc_media_player_new", newPlayer);
  LOAD_VLC("libvlc_media_player_release", releasePlayer);
  LOAD_VLC("libvlc_media_player_set_media", setMedia);
  LOAD_VLC("libvlc_media_player_set_hwnd", setHwnd);
  LOAD_VLC("libvlc_media_player_play", play);
  LOAD_VLC("libvlc_media_player_set_pause", setPause);
  LOAD_VLC("libvlc_media_player_stop", stop);
  LOAD_VLC("libvlc_media_player_get_state", getState);
  LOAD_VLC("libvlc_media_player_get_time", getTime);
  LOAD_VLC("libvlc_media_player_set_time", setTime);
  LOAD_VLC("libvlc_media_player_get_length", getLength);
  LOAD_VLC("libvlc_media_player_add_slave", addSlave);
  LOAD_VLC("libvlc_video_get_spu", getSubtitleTrack);
  LOAD_VLC("libvlc_video_set_spu", setSubtitleTrack);
  LOAD_VLC("libvlc_audio_get_volume", getVolume);
  LOAD_VLC("libvlc_audio_set_volume", setVolume);

  const std::string colorOption = "--freetype-color=" + subtitleColor;
  const std::string sizeOption = "--freetype-rel-fontsize=" + subtitleSize;
  const std::string backgroundOption = "--freetype-background-opacity=" + subtitleBackground;
  const char* options[] = {
    "--no-video-title-show", "--no-osd", "--quiet", "--network-caching=1200",
    "--avcodec-hw=d3d11va", colorOption.c_str(), sizeOption.c_str(), backgroundOption.c_str()
  };
  instance = api.newInstance(static_cast<int>(sizeof(options) / sizeof(options[0])), options);
  if (!instance) {
    lastError = "libVLC could not initialize.";
    return false;
  }
  player = api.newPlayer(instance);
  if (!player) {
    lastError = "libVLC could not create a media player.";
    return false;
  }
  return true;
}

void scheduleSubtitleTrack(int track) {
  const uint64_t generation = ++subtitleCommandGeneration;
  std::thread([generation, track]() {
    const int delays[] = {0, 250, 700, 1400};
    int elapsed = 0;
    for (const int delay : delays) {
      std::this_thread::sleep_for(std::chrono::milliseconds(delay - elapsed));
      elapsed = delay;
      if (!player || generation != subtitleCommandGeneration.load()) return;
      api.setSubtitleTrack(player, track);
    }
  }).detach();
}

napi_value start(napi_env env, napi_callback_info info) {
  size_t argc = 7;
  napi_value argv[7];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (argc < 4) return jsString(env, "Native player arguments are incomplete.");
  HWND parent = nativeWindowFromBuffer(env, argv[0]);
  if (!parent) return jsString(env, "PRISM could not resolve its native Windows video surface.");
  const std::string libraryPath = stringArg(env, argv[1]);
  const std::string pluginPath = stringArg(env, argv[2]);
  const std::string url = stringArg(env, argv[3]);
  const std::string subtitleColor = argc > 4 ? stringArg(env, argv[4]) : "16777215";
  const std::string subtitleSize = argc > 5 ? stringArg(env, argv[5]) : "16";
  const std::string subtitleBackground = argc > 6 ? stringArg(env, argv[6]) : "120";
  if (!loadRuntime(libraryPath, pluginPath, subtitleColor, subtitleSize, subtitleBackground)) return jsString(env, lastError);
  if (!attachVideoWindow(parent)) return jsString(env, lastError);

  api.stop(player);
  libvlc_media_t* media = api.newLocation(instance, url.c_str());
  if (!media) return jsString(env, "libVLC could not open this media URL.");
  api.addOption(media, ":http-reconnect");
  api.addOption(media, ":input-repeat=0");
  api.addOption(media, ":sub-track=-1");
  api.setMedia(player, media);
  api.releaseMedia(media);
  api.setHwnd(player, videoWindow);
  if (api.play(player) != 0) return jsString(env, "libVLC could not start playback.");
  scheduleSubtitleTrack(-1);
  lastError.clear();
  napi_value nullValue;
  napi_get_null(env, &nullValue);
  return nullValue;
}

napi_value runtimeCheck(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (argc < 2) return jsString(env, "Native runtime paths are incomplete.");
  if (!loadRuntime(stringArg(env, argv[0]), stringArg(env, argv[1]))) return jsString(env, lastError);
  napi_value nullValue;
  napi_get_null(env, &nullValue);
  return nullValue;
}

napi_value stop(napi_env env, napi_callback_info) {
  ++subtitleCommandGeneration;
  if (player) api.stop(player);
  if (videoWindow) ShowWindow(videoWindow, SW_HIDE);
  napi_value undefined;
  napi_get_undefined(env, &undefined);
  return undefined;
}

napi_value resize(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  HWND parent = argc ? nativeWindowFromBuffer(env, argv[0]) : nullptr;
  if (parent) parentWindow = parent;
  resizeVideoWindow();
  return jsBoolean(env, videoWindow != nullptr);
}

napi_value setPaused(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  bool paused = false;
  if (argc) napi_get_value_bool(env, argv[0], &paused);
  if (player) api.setPause(player, paused ? 1 : 0);
  return jsBoolean(env, player != nullptr);
}

napi_value setTime(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  int64_t milliseconds = 0;
  if (argc) napi_get_value_int64(env, argv[0], &milliseconds);
  return jsBoolean(env, player && api.setTime(player, milliseconds) == 0);
}

napi_value setVolume(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  int32_t volume = 100;
  if (argc) napi_get_value_int32(env, argv[0], &volume);
  return jsBoolean(env, player && api.setVolume(player, std::max(0, std::min(125, volume))) == 0);
}

napi_value addSubtitle(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (!player || !argc) return jsBoolean(env, false);
  ++subtitleCommandGeneration;
  const std::string url = stringArg(env, argv[0]);
  const libvlc_state_t previousState = api.getState(player);
  const libvlc_time_t previousTime = api.getTime(player);
  const bool wasPlaying = previousState == libvlc_Playing || previousState == libvlc_Opening || previousState == libvlc_Buffering;
  const bool added = api.addSlave(player, libvlc_media_slave_type_subtitle, url.c_str(), true) == 0;
  if (added && wasPlaying) {
    api.play(player);
    if (previousTime > 0) api.setTime(player, previousTime);
  }
  return jsBoolean(env, added);
}

napi_value disableSubtitles(napi_env env, napi_callback_info) {
  if (!player) return jsBoolean(env, false);
  scheduleSubtitleTrack(-1);
  return jsBoolean(env, true);
}

napi_value selectSubtitle(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  int32_t track = -1;
  if (!player || !argc || napi_get_value_int32(env, argv[0], &track) != napi_ok || track < 0) return jsBoolean(env, false);
  scheduleSubtitleTrack(track);
  return jsBoolean(env, true);
}

napi_value state(napi_env env, napi_callback_info) {
  napi_value result;
  napi_create_object(env, &result);
  const libvlc_state_t current = player ? api.getState(player) : libvlc_NothingSpecial;
  setNamedBoolean(env, result, "active", player && videoWindow && IsWindowVisible(videoWindow));
  setNamedBoolean(env, result, "playing", current == libvlc_Playing || current == libvlc_Opening || current == libvlc_Buffering);
  setNamedBoolean(env, result, "paused", current == libvlc_Paused);
  setNamedBoolean(env, result, "ended", current == libvlc_Ended);
  setNamedBoolean(env, result, "error", current == libvlc_Error);
  setNamedNumber(env, result, "timeMs", player ? static_cast<double>(api.getTime(player)) : 0);
  setNamedNumber(env, result, "durationMs", player ? static_cast<double>(api.getLength(player)) : 0);
  setNamedNumber(env, result, "volume", player ? static_cast<double>(api.getVolume(player)) : 100);
  setNamedNumber(env, result, "subtitleTrack", player ? static_cast<double>(api.getSubtitleTrack(player)) : -1);
  setNamedString(env, result, "message", current == libvlc_Error ? "The Windows player could not decode this title." : lastError);
  return result;
}

napi_value inspectParent(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  HWND parent = argc ? nativeWindowFromBuffer(env, argv[0]) : nullptr;
  napi_value result;
  napi_create_object(env, &result);
  setNamedString(env, result, "className", parent ? "HWND" : "");
  setNamedNumber(env, result, "subviewCount", parent && videoWindow && GetParent(videoWindow) == parent ? 1 : 0);
  return result;
}

void cleanup(void*) {
  ++subtitleCommandGeneration;
  if (player) { api.stop(player); api.releasePlayer(player); player = nullptr; }
  if (instance) { api.releaseInstance(instance); instance = nullptr; }
  if (videoWindow) { DestroyWindow(videoWindow); videoWindow = nullptr; parentWindow = nullptr; }
  if (api.library) { FreeLibrary(api.library); api.library = nullptr; }
  if (api.coreLibrary) { FreeLibrary(api.coreLibrary); api.coreLibrary = nullptr; }
}

napi_value initialize(napi_env env, napi_value exports) {
  napi_property_descriptor properties[] = {
    {"runtimeCheck", nullptr, runtimeCheck, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"start", nullptr, start, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"stop", nullptr, stop, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"resize", nullptr, resize, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"setPaused", nullptr, setPaused, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"setTime", nullptr, setTime, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"setVolume", nullptr, setVolume, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"addSubtitle", nullptr, addSubtitle, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"selectSubtitle", nullptr, selectSubtitle, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"disableSubtitles", nullptr, disableSubtitles, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"state", nullptr, state, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"inspectParent", nullptr, inspectParent, nullptr, nullptr, nullptr, napi_default, nullptr}
  };
  napi_define_properties(env, exports, sizeof(properties) / sizeof(properties[0]), properties);
  napi_add_env_cleanup_hook(env, cleanup, nullptr);
  return exports;
}

} // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, initialize)
