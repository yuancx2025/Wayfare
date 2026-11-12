// iOS 27 refuses to launch apps built with its SDK unless they adopt the UIScene life cycle. Expo SDK 57 ships
// `ExpoAppSceneDelegate` for this, but the generated project does not use it yet, so this plugin opts in:
// the scene delegate creates the window and starts React Native, and the AppDelegate only creates the factory.
const { withAppDelegate, withInfoPlist } = require("expo/config-plugins");

const WINDOW_START = /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\)\n#endif\n/;

function adoptSceneDelegate(contents) {
  if (contents.includes("ExpoReactNativeFactoryProvider")) return contents;
  if (!WINDOW_START.test(contents)) {
    throw new Error("withSceneLifecycle: AppDelegate.swift no longer matches the expected template; update the plugin.");
  }
  return contents
    .replace("class AppDelegate: ExpoAppDelegate {", "class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {")
    .replace(WINDOW_START, "\n    // ExpoAppSceneDelegate creates the window and starts React Native when the scene connects.\n");
}

module.exports = function withSceneLifecycle(config) {
  config = withAppDelegate(config, (mod) => {
    if (mod.modResults.language !== "swift") throw new Error("withSceneLifecycle expects a Swift AppDelegate.");
    mod.modResults.contents = adoptSceneDelegate(mod.modResults.contents);
    return mod;
  });
  return withInfoPlist(config, (mod) => {
    mod.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          { UISceneConfigurationName: "Default Configuration", UISceneDelegateClassName: "EXExpoAppSceneDelegate" },
        ],
      },
    };
    return mod;
  });
};
