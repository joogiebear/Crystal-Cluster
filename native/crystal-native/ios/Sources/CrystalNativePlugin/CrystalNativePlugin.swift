import Capacitor
import Foundation
import StoreKit
import UIKit

/// Crystal Cluster's native bridge. One plugin, four jobs:
/// Game Center (GameCenter.swift), In-App Purchase (Store.swift),
/// iCloud save sync (CloudSave.swift) and alternate app icons (below).
/// The web side talks to it through `Capacitor.Plugins.CrystalNative` (see js/native.js).
@objc(CrystalNativePlugin)
public class CrystalNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CrystalNativePlugin"
    public let jsName = "CrystalNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "gcSignIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "gcReportAchievements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "gcSubmitScore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "gcShow", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "iapProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "iapPurchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "iapEntitlements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "iapRestore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cloudGet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cloudSet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getIcon", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setIcon", returnType: CAPPluginReturnPromise)
    ]

    var transactionUpdates: Task<Void, Never>?

    override public func load() {
        startTransactionListener()
        startCloudObserver()
    }

    deinit {
        transactionUpdates?.cancel()
        NotificationCenter.default.removeObserver(self)
    }

    // MARK: - Alternate app icon

    @objc public func getIcon(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let name = UIApplication.shared.alternateIconName {
                call.resolve(["name": name])
            } else {
                call.resolve(["name": NSNull()])
            }
        }
    }

    /// `name` is an alternate icon set in the asset catalog, or null/missing for the default icon.
    @objc public func setIcon(_ call: CAPPluginCall) {
        let name = call.getString("name")
        DispatchQueue.main.async {
            guard UIApplication.shared.supportsAlternateIcons else {
                call.reject("Alternate icons are not supported on this device")
                return
            }
            if UIApplication.shared.alternateIconName == name {
                call.resolve()
                return
            }
            UIApplication.shared.setAlternateIconName(name) { error in
                if let error = error {
                    call.reject(error.localizedDescription)
                } else {
                    call.resolve()
                }
            }
        }
    }
}
