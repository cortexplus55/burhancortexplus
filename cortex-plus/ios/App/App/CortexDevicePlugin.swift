import AVFoundation
import Capacitor
import LocalAuthentication
import StoreKit
import UIKit

/// Cortex Plus'ın kendi yerel köprüsü (26 Kasım 2026, mobil 1. adım). Sayfa `registerPlugin("CortexDevice")` ile
/// çağırır (`src/lib/platform/native-device.ts`); köprü `CortexBridgeViewController` içinde kaydedilir.
///
/// - Uygulama kilidi: yüz tanıma, parmak izi ya da cihaz şifresi (`deviceOwnerAuthentication`). Biyometrik veri
///   cihazdan çıkmaz; sayfa yalnız "doğrulandı / doğrulanmadı" sonucunu görür.
/// - Mağaza değerlendirmesi: işletim sisteminin kendi penceresi. Gösterilip gösterilmeyeceğine sistem karar verir.
/// - Ders sesi: iOS'ta kilit ekranı ve Denetim Merkezi bilgisini web görünümü (Media Session) kendisi yayımlar; burada
///   yalnız ses oturumunun "çalma" kipinde etkin olduğu güvenceye alınır (arka planda sürmesi için).
@objc(CortexDevicePlugin)
public class CortexDevicePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CortexDevicePlugin"
    public let jsName = "CortexDevice"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "biometricStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "biometricVerify", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestReview", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "mediaUpdate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "mediaStop", returnType: CAPPluginReturnPromise)
    ]

    @objc func biometricStatus(_ call: CAPPluginCall) {
        let biometricContext = LAContext()
        var biometricError: NSError?
        let biometric = biometricContext.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &biometricError)
        var ownerError: NSError?
        let available = LAContext().canEvaluatePolicy(.deviceOwnerAuthentication, error: &ownerError)
        var kind = "none"
        if biometric {
            switch biometricContext.biometryType {
            case .faceID:
                kind = "face"
            case .touchID:
                kind = "fingerprint"
            default:
                kind = "biometric"
            }
        } else if available {
            kind = "passcode"
        }
        call.resolve(["available": available, "biometric": biometric, "kind": kind])
    }

    @objc func biometricVerify(_ call: CAPPluginCall) {
        let reason = call.getString("reason") ?? "Cortex Plus'ı açmak için kimliğini doğrula."
        let context = LAContext()
        context.localizedCancelTitle = call.getString("cancelTitle") ?? "Vazgeç"
        context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { success, error in
            if success {
                call.resolve(["verified": true])
                return
            }
            var outcome = "failed"
            if let code = (error as? LAError)?.code {
                switch code {
                case .userCancel, .appCancel, .systemCancel:
                    outcome = "cancelled"
                case .passcodeNotSet, .biometryNotEnrolled, .biometryNotAvailable:
                    outcome = "unavailable"
                case .biometryLockout:
                    outcome = "lockout"
                default:
                    outcome = "failed"
                }
            }
            call.resolve(["verified": false, "reason": outcome])
        }
    }

    @objc func requestReview(_ call: CAPPluginCall) {
        Task { @MainActor in
            let scene = UIApplication.shared.connectedScenes
                .first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene
            guard let windowScene = scene else {
                call.resolve(["requested": false])
                return
            }
            if #available(iOS 16.0, *) {
                AppStore.requestReview(in: windowScene)
            } else {
                SKStoreReviewController.requestReview(in: windowScene)
            }
            call.resolve(["requested": true])
        }
    }

    @objc func mediaUpdate(_ call: CAPPluginCall) {
        if call.getBool("playing") == true {
            try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [])
            try? AVAudioSession.sharedInstance().setActive(true)
        }
        call.resolve(["native": false])
    }

    @objc func mediaStop(_ call: CAPPluginCall) {
        call.resolve()
    }
}
