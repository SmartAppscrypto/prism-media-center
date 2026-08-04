{
  "targets": [
    {
      "target_name": "prism_vlc",
      "sources": ["prism_vlc.mm"],
      "include_dirs": ["/Applications/VLC.app/Contents/MacOS/include"],
      "xcode_settings": {
        "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
        "CLANG_ENABLE_OBJC_ARC": "YES",
        "OTHER_LDFLAGS": ["-framework Cocoa"]
      }
    }
  ]
}
