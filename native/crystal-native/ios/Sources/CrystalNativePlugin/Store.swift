import Capacitor
import Foundation
import StoreKit

/// In-App Purchase with StoreKit 2. The App Store is the source of truth for what is owned:
/// the web side only caches the answer. Tips are consumables; cosmetic packs are non-consumables.
extension CrystalNativePlugin {
    func startTransactionListener() {
        transactionUpdates?.cancel()
        // Purchases that finish outside a direct purchase() call arrive here:
        // Ask to Buy approvals, purchases on another device, refunds.
        transactionUpdates = Task.detached { [weak self] in
            for await result in Transaction.updates {
                guard case .verified(let transaction) = result else { continue }
                await transaction.finish()
                self?.notifyListeners("iapUpdated", data: [
                    "id": transaction.productID,
                    "revoked": transaction.revocationDate != nil
                ])
            }
        }
    }

    func ownedProductIDs() async -> [String] {
        var ids: [String] = []
        for await result in Transaction.currentEntitlements {
            if case .verified(let transaction) = result, transaction.revocationDate == nil {
                ids.append(transaction.productID)
            }
        }
        return ids
    }

    /// `ids`: product identifiers. Resolves with localized titles and prices for the ones the App Store knows.
    @objc public func iapProducts(_ call: CAPPluginCall) {
        let ids = call.getArray("ids", String.self) ?? []
        Task {
            do {
                let products = try await Product.products(for: ids)
                let list: [[String: Any]] = products.map { product in
                    [
                        "id": product.id,
                        "title": product.displayName,
                        "description": product.description,
                        "price": product.displayPrice
                    ]
                }
                call.resolve(["products": list])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    /// Resolves with `status`: "purchased", "cancelled" or "pending" (Ask to Buy).
    @objc public func iapPurchase(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else {
            call.reject("Missing product id")
            return
        }
        Task {
            do {
                guard let product = try await Product.products(for: [id]).first else {
                    call.reject("This item is not available right now")
                    return
                }
                let result = try await product.purchase()
                switch result {
                case .success(let verification):
                    switch verification {
                    case .verified(let transaction):
                        await transaction.finish()
                        call.resolve(["status": "purchased", "id": transaction.productID])
                    case .unverified(_, let error):
                        call.reject("The purchase could not be verified: \(error.localizedDescription)")
                    }
                case .userCancelled:
                    call.resolve(["status": "cancelled", "id": id])
                case .pending:
                    call.resolve(["status": "pending", "id": id])
                @unknown default:
                    call.resolve(["status": "cancelled", "id": id])
                }
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    /// Resolves with `owned`: identifiers of the non-consumables this Apple ID owns.
    @objc public func iapEntitlements(_ call: CAPPluginCall) {
        Task {
            let owned = await ownedProductIDs()
            call.resolve(["owned": owned])
        }
    }

    /// "Restore Purchases": asks the App Store to re-sync, then reports what is owned.
    @objc public func iapRestore(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
                let owned = await ownedProductIDs()
                call.resolve(["owned": owned])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }
}
