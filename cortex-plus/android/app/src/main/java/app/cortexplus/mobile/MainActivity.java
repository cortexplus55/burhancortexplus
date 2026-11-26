package app.cortexplus.mobile;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Uygulamanın kendi eklentisi (kilit, mağaza değerlendirmesi, ders sesi denetimleri) köprüden önce kaydedilir.
        registerPlugin(CortexDevicePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
