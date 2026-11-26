import Capacitor
import UIKit

/// Capacitor'ın web görünümü denetleyicisi; uygulamanın kendi eklentisini (`CortexDevicePlugin`) köprüye kaydeder.
/// Paket olarak dağıtılmayan, uygulamanın içindeki eklentiler bu yolla tanıtılır.
class CortexBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(CortexDevicePlugin())
    }
}
