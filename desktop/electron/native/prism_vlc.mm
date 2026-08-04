#include <node_api.h>
#include <vlc/vlc.h>
#include <Cocoa/Cocoa.h>
#include <dlfcn.h>
#include <algorithm>
#include <cstdlib>
#include <cstring>
#include <string>

namespace {

struct VlcApi {
  void* coreLibrary = nullptr;
  void* library = nullptr;
  decltype(&libvlc_new) newInstance = nullptr;
  decltype(&libvlc_release) releaseInstance = nullptr;
  decltype(&libvlc_media_new_location) newLocation = nullptr;
  decltype(&libvlc_media_add_option) addOption = nullptr;
  decltype(&libvlc_media_release) releaseMedia = nullptr;
  decltype(&libvlc_media_player_new) newPlayer = nullptr;
  decltype(&libvlc_media_player_release) releasePlayer = nullptr;
  decltype(&libvlc_media_player_set_media) setMedia = nullptr;
  decltype(&libvlc_media_player_set_nsobject) setNSObject = nullptr;
  decltype(&libvlc_media_player_play) play = nullptr;
  decltype(&libvlc_media_player_set_pause) setPause = nullptr;
  decltype(&libvlc_media_player_stop) stop = nullptr;
  decltype(&libvlc_media_player_get_state) getState = nullptr;
  decltype(&libvlc_media_player_get_time) getTime = nullptr;
  decltype(&libvlc_media_player_set_time) setTime = nullptr;
  decltype(&libvlc_media_player_get_length) getLength = nullptr;
  decltype(&libvlc_media_player_add_slave) addSlave = nullptr;
  decltype(&libvlc_video_set_spu) setSubtitleTrack = nullptr;
  decltype(&libvlc_audio_get_volume) getVolume = nullptr;
  decltype(&libvlc_audio_set_volume) setVolume = nullptr;
};

VlcApi api;
libvlc_instance_t* instance = nullptr;
libvlc_media_player_t* player = nullptr;
NSView* videoView = nil;
NSView* parentView = nil;
std::string lastError;

#define LOAD_VLC(symbol, field) \
  api.field = reinterpret_cast<decltype(api.field)>(dlsym(api.library, symbol)); \
  if (!api.field) { lastError = std::string("Missing libVLC symbol: ") + symbol; return false; }

std::string stringArg(napi_env env, napi_value value) {
  size_t size = 0;
  napi_get_value_string_utf8(env, value, nullptr, 0, &size);
  std::string result(size, '\0');
  napi_get_value_string_utf8(env, value, result.data(), size + 1, &size);
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

NSView* nativeViewFromBuffer(napi_env env, napi_value value) {
  bool isBuffer = false;
  napi_is_buffer(env, value, &isBuffer);
  if (!isBuffer) return nil;
  void* data = nullptr;
  size_t length = 0;
  napi_get_buffer_info(env, value, &data, &length);
  if (!data || length < sizeof(void*)) return nil;
  void* pointer = nullptr;
  std::memcpy(&pointer, data, sizeof(void*));
  return (__bridge NSView*)pointer;
}

bool loadRuntime(const std::string& libraryPath, const std::string& pluginPath, const std::string& subtitleColor = "16777215", const std::string& subtitleSize = "16", const std::string& subtitleBackground = "120") {
  if (instance) return true;
  setenv("VLC_PLUGIN_PATH", pluginPath.c_str(), 1);
  const size_t separator = libraryPath.find_last_of('/');
  const std::string corePath = (separator == std::string::npos ? std::string() : libraryPath.substr(0, separator + 1)) + "libvlccore.9.dylib";
  api.coreLibrary = dlopen(corePath.c_str(), RTLD_NOW | RTLD_GLOBAL);
  if (!api.coreLibrary) {
    lastError = dlerror() ?: "Could not load the libVLC core.";
    return false;
  }
  api.library = dlopen(libraryPath.c_str(), RTLD_NOW | RTLD_LOCAL);
  if (!api.library) {
    lastError = dlerror() ?: "Could not load libVLC.";
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
  LOAD_VLC("libvlc_media_player_set_nsobject", setNSObject);
  LOAD_VLC("libvlc_media_player_play", play);
  LOAD_VLC("libvlc_media_player_set_pause", setPause);
  LOAD_VLC("libvlc_media_player_stop", stop);
  LOAD_VLC("libvlc_media_player_get_state", getState);
  LOAD_VLC("libvlc_media_player_get_time", getTime);
  LOAD_VLC("libvlc_media_player_set_time", setTime);
  LOAD_VLC("libvlc_media_player_get_length", getLength);
  LOAD_VLC("libvlc_media_player_add_slave", addSlave);
  LOAD_VLC("libvlc_video_set_spu", setSubtitleTrack);
  LOAD_VLC("libvlc_audio_get_volume", getVolume);
  LOAD_VLC("libvlc_audio_set_volume", setVolume);

  const std::string colorOption = "--freetype-color=" + subtitleColor;
  const std::string sizeOption = "--freetype-rel-fontsize=" + subtitleSize;
  const std::string backgroundOption = "--freetype-background-opacity=" + subtitleBackground;
  const char* options[] = {
    "--no-video-title-show",
    "--no-osd",
    "--quiet",
    "--network-caching=1200",
    colorOption.c_str(),
    sizeOption.c_str(),
    backgroundOption.c_str()
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

void attachVideoView(NSView* parent) {
  void (^attach)(void) = ^{
    if (videoView.superview) [videoView removeFromSuperview];
    parentView = parent;
    if (!videoView) {
      videoView = [[NSView alloc] initWithFrame:parent.bounds];
      videoView.wantsLayer = YES;
      videoView.layer.backgroundColor = NSColor.blackColor.CGColor;
      videoView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    }
    videoView.frame = parent.bounds;
    videoView.hidden = NO;
    NSArray<NSView*>* subviews = parent.subviews;
    if (subviews.count > 0) [parent addSubview:videoView positioned:NSWindowBelow relativeTo:subviews.firstObject];
    else [parent addSubview:videoView];
  };
  if (NSThread.isMainThread) attach(); else dispatch_sync(dispatch_get_main_queue(), attach);
}

void hideVideoView() {
  void (^hide)(void) = ^{ if (videoView) videoView.hidden = YES; };
  if (NSThread.isMainThread) hide(); else dispatch_sync(dispatch_get_main_queue(), hide);
}

napi_value start(napi_env env, napi_callback_info info) {
  size_t argc = 7;
  napi_value argv[7];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (argc < 4) return jsString(env, "Native player arguments are incomplete.");
  NSView* parent = nativeViewFromBuffer(env, argv[0]);
  if (!parent) return jsString(env, "PRISM could not resolve its native video surface.");
  const std::string libraryPath = stringArg(env, argv[1]);
  const std::string pluginPath = stringArg(env, argv[2]);
  const std::string url = stringArg(env, argv[3]);
  const std::string subtitleColor = argc > 4 ? stringArg(env, argv[4]) : "16777215";
  const std::string subtitleSize = argc > 5 ? stringArg(env, argv[5]) : "16";
  const std::string subtitleBackground = argc > 6 ? stringArg(env, argv[6]) : "120";
  if (!loadRuntime(libraryPath, pluginPath, subtitleColor, subtitleSize, subtitleBackground)) return jsString(env, lastError);

  attachVideoView(parent);
  api.stop(player);
  libvlc_media_t* media = api.newLocation(instance, url.c_str());
  if (!media) return jsString(env, "libVLC could not open this media URL.");
  api.addOption(media, ":http-reconnect");
  api.addOption(media, ":input-repeat=0");
  api.setMedia(player, media);
  api.releaseMedia(media);
  api.setNSObject(player, (__bridge void*)videoView);
  if (api.play(player) != 0) return jsString(env, "libVLC could not start playback.");
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
  const bool loaded = loadRuntime(stringArg(env, argv[0]), stringArg(env, argv[1]));
  if (!loaded) return jsString(env, lastError);
  napi_value nullValue;
  napi_get_null(env, &nullValue);
  return nullValue;
}

napi_value stop(napi_env env, napi_callback_info) {
  if (player) api.stop(player);
  hideVideoView();
  napi_value undefined;
  napi_get_undefined(env, &undefined);
  return undefined;
}

napi_value setPaused(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  bool paused = false;
  if (argc) napi_get_value_bool(env, argv[0], &paused);
  if (player) api.setPause(player, paused ? 1 : 0);
  return jsBoolean(env, true);
}

napi_value setTime(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  int64_t milliseconds = 0;
  if (argc) napi_get_value_int64(env, argv[0], &milliseconds);
  if (player) api.setTime(player, static_cast<libvlc_time_t>(milliseconds));
  return jsBoolean(env, true);
}

napi_value setVolume(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  int32_t volume = 100;
  if (argc) napi_get_value_int32(env, argv[0], &volume);
  if (player) api.setVolume(player, std::max(0, std::min(125, volume)));
  return jsBoolean(env, true);
}

napi_value addSubtitle(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (!player || !argc) return jsBoolean(env, false);
  const std::string url = stringArg(env, argv[0]);
  return jsBoolean(env, api.addSlave(player, libvlc_media_slave_type_subtitle, url.c_str(), true) == 0);
}

napi_value disableSubtitles(napi_env env, napi_callback_info) {
  return jsBoolean(env, player && api.setSubtitleTrack(player, -1) == 0);
}

napi_value state(napi_env env, napi_callback_info) {
  napi_value result;
  napi_create_object(env, &result);
  const libvlc_state_t current = player ? api.getState(player) : libvlc_NothingSpecial;
  setNamedBoolean(env, result, "active", player && videoView && !videoView.hidden);
  setNamedBoolean(env, result, "playing", current == libvlc_Playing || current == libvlc_Opening || current == libvlc_Buffering);
  setNamedBoolean(env, result, "paused", current == libvlc_Paused);
  setNamedBoolean(env, result, "ended", current == libvlc_Ended);
  setNamedBoolean(env, result, "error", current == libvlc_Error);
  setNamedNumber(env, result, "timeMs", player ? static_cast<double>(api.getTime(player)) : 0);
  setNamedNumber(env, result, "durationMs", player ? static_cast<double>(api.getLength(player)) : 0);
  setNamedNumber(env, result, "volume", player ? static_cast<double>(api.getVolume(player)) : 100);
  setNamedString(env, result, "message", current == libvlc_Error ? "The native player could not decode this title." : lastError);
  return result;
}

napi_value inspectParent(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  NSView* parent = argc ? nativeViewFromBuffer(env, argv[0]) : nil;
  napi_value result;
  napi_create_object(env, &result);
  setNamedString(env, result, "className", parent ? std::string(NSStringFromClass(parent.class).UTF8String) : "");
  setNamedNumber(env, result, "subviewCount", parent ? parent.subviews.count : 0);
  return result;
}

void cleanup(void*) {
  if (player) { api.stop(player); api.releasePlayer(player); player = nullptr; }
  if (instance) { api.releaseInstance(instance); instance = nullptr; }
  if (videoView) {
    void (^remove)(void) = ^{ [videoView removeFromSuperview]; videoView = nil; parentView = nil; };
    if (NSThread.isMainThread) remove(); else dispatch_sync(dispatch_get_main_queue(), remove);
  }
  if (api.library) { dlclose(api.library); api.library = nullptr; }
  if (api.coreLibrary) { dlclose(api.coreLibrary); api.coreLibrary = nullptr; }
}

napi_value initialize(napi_env env, napi_value exports) {
  napi_property_descriptor properties[] = {
    {"runtimeCheck", nullptr, runtimeCheck, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"start", nullptr, start, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"stop", nullptr, stop, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"setPaused", nullptr, setPaused, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"setTime", nullptr, setTime, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"setVolume", nullptr, setVolume, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"addSubtitle", nullptr, addSubtitle, nullptr, nullptr, nullptr, napi_default, nullptr},
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
