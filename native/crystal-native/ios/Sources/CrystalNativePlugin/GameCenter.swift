import Capacitor
import GameKit
import UIKit

extension CrystalNativePlugin: GKGameCenterControllerDelegate {
    func playerInfo() -> [String: Any] {
        let player = GKLocalPlayer.local
        return [
            "signedIn": player.isAuthenticated,
            "alias": player.isAuthenticated ? player.displayName : ""
        ]
    }

    /// Signs the player in. iOS shows its own sheet the first time; after that it is silent.
    /// Always resolves, with `signedIn: false` if the player declined or Game Center is unavailable.
    @objc public func gcSignIn(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let player = GKLocalPlayer.local
            if player.isAuthenticated {
                call.resolve(self.playerInfo())
                return
            }
            var settled = false
            player.authenticateHandler = { [weak self] viewController, error in
                guard let self = self else { return }
                if let viewController = viewController {
                    self.bridge?.viewController?.present(viewController, animated: true)
                    return
                }
                // iOS calls this handler again whenever the sign-in state changes.
                self.notifyListeners("gameCenterChanged", data: self.playerInfo())
                if settled { return }
                settled = true
                var info = self.playerInfo()
                if let error = error {
                    info["error"] = error.localizedDescription
                }
                call.resolve(info)
            }
        }
    }

    /// `ids`: achievement identifiers to mark as 100% complete.
    @objc public func gcReportAchievements(_ call: CAPPluginCall) {
        let ids = call.getArray("ids", String.self) ?? []
        guard GKLocalPlayer.local.isAuthenticated, !ids.isEmpty else {
            call.resolve(["reported": 0])
            return
        }
        let achievements = ids.map { id -> GKAchievement in
            let achievement = GKAchievement(identifier: id)
            achievement.percentComplete = 100
            achievement.showsCompletionBanner = true
            return achievement
        }
        GKAchievement.report(achievements) { error in
            if let error = error {
                call.reject(error.localizedDescription)
            } else {
                call.resolve(["reported": ids.count])
            }
        }
    }

    /// `id`: leaderboard identifier, `score`: whole number.
    @objc public func gcSubmitScore(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let raw = call.options["score"] as? NSNumber else {
            call.reject("Missing leaderboard id or score")
            return
        }
        guard GKLocalPlayer.local.isAuthenticated else {
            call.resolve(["submitted": false])
            return
        }
        let clamped = min(max(raw.doubleValue, 0), 9.0e18)
        GKLeaderboard.submitScore(Int(clamped), context: 0, player: GKLocalPlayer.local, leaderboardIDs: [id]) { error in
            if let error = error {
                call.reject(error.localizedDescription)
            } else {
                call.resolve(["submitted": true])
            }
        }
    }

    /// `view`: "dashboard" (default), "achievements" or "leaderboards".
    @objc public func gcShow(_ call: CAPPluginCall) {
        let view = call.getString("view") ?? "dashboard"
        DispatchQueue.main.async {
            guard GKLocalPlayer.local.isAuthenticated else {
                call.reject("Not signed in to Game Center")
                return
            }
            let controller: GKGameCenterViewController
            switch view {
            case "achievements":
                controller = GKGameCenterViewController(state: .achievements)
            case "leaderboards":
                controller = GKGameCenterViewController(state: .leaderboards)
            default:
                controller = GKGameCenterViewController(state: .dashboard)
            }
            controller.gameCenterDelegate = self
            self.bridge?.viewController?.present(controller, animated: true)
            call.resolve()
        }
    }

    public func gameCenterViewControllerDidFinish(_ gameCenterViewController: GKGameCenterViewController) {
        gameCenterViewController.dismiss(animated: true)
    }
}
