import Capacitor
import Foundation

/// iCloud save sync through the key-value store. Saves are a few kilobytes, well inside
/// the 1 MB limit, and the store keeps working (locally) when the player has no iCloud account.
/// Needs the "iCloud > Key-value storage" capability on the app target.
extension CrystalNativePlugin {
    func startCloudObserver() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(cloudDidChange(_:)),
            name: NSUbiquitousKeyValueStore.didChangeExternallyNotification,
            object: NSUbiquitousKeyValueStore.default
        )
        NSUbiquitousKeyValueStore.default.synchronize()
    }

    @objc func cloudDidChange(_ notification: Notification) {
        let keys = notification.userInfo?[NSUbiquitousKeyValueStoreChangedKeysKey] as? [String] ?? []
        notifyListeners("cloudChanged", data: ["keys": keys])
    }

    @objc public func cloudGet(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else {
            call.reject("Missing key")
            return
        }
        let signedIn = FileManager.default.ubiquityIdentityToken != nil
        if let value = NSUbiquitousKeyValueStore.default.string(forKey: key) {
            call.resolve(["value": value, "signedIn": signedIn])
        } else {
            call.resolve(["value": NSNull(), "signedIn": signedIn])
        }
    }

    @objc public func cloudSet(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else {
            call.reject("Missing key")
            return
        }
        let store = NSUbiquitousKeyValueStore.default
        if let value = call.getString("value") {
            store.set(value, forKey: key)
        } else {
            store.removeObject(forKey: key)
        }
        store.synchronize()
        call.resolve()
    }
}
