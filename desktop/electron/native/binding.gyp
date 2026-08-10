{
  "targets": [
    {
      "target_name": "prism_vlc",
      "sources": [],
      "conditions": [
        ["OS=='mac'", {
          "sources": ["prism_vlc.mm"],
          "include_dirs": ["/Applications/VLC.app/Contents/MacOS/include"],
          "xcode_settings": {
            "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
            "CLANG_ENABLE_OBJC_ARC": "YES",
            "OTHER_LDFLAGS": ["-framework Cocoa"]
          }
        }],
        ["OS=='win'", {
          "sources": ["prism_vlc_win.cc"],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "AdditionalOptions": ["/std:c++17"],
              "ExceptionHandling": 1
            }
          }
        }]
      ]
    }
  ]
}
