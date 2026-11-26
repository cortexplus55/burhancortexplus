package app.cortexplus.mobile;

import android.os.Bundle;
import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.review.ReviewInfo;
import com.google.android.play.core.review.ReviewManager;
import com.google.android.play.core.review.ReviewManagerFactory;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Cortex Plus'ın kendi yerel köprüsü (26 Kasım 2026, mobil 1. adım). Sayfa `registerPlugin("CortexDevice")` ile çağırır
 * (`src/lib/platform/native-device.ts`); eklenti `MainActivity` içinde kaydedilir.
 *
 * - Uygulama kilidi: parmak izi, yüz tanıma ya da cihaz kilidi (BiometricPrompt). Biyometrik veri cihazdan çıkmaz.
 * - Mağaza değerlendirmesi: Google Play'in uygulama içi değerlendirme penceresi; gösterilip gösterilmeyeceğine Play
 *   karar verir.
 * - Ders sesi: kilit ekranı ve bildirim alanındaki oynatma denetimleri (`CortexMediaService`). Düğmeler sayfaya
 *   `mediaAction` olayı olarak döner; sesi web görünümü çalar.
 */
@CapacitorPlugin(name = "CortexDevice")
public class CortexDevicePlugin extends Plugin {

    private static final int AUTHENTICATORS =
        BiometricManager.Authenticators.BIOMETRIC_WEAK | BiometricManager.Authenticators.DEVICE_CREDENTIAL;

    private static CortexDevicePlugin active;

    @Override
    public void load() {
        active = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (active == this) active = null;
        CortexMediaService.stop(getContext());
    }

    /** Medya bildirimindeki ya da kulaklıktaki düğme: sayfaya iletilir. */
    static void emitMediaAction(String action, long positionMs) {
        CortexDevicePlugin plugin = active;
        if (plugin == null) return;
        JSObject data = new JSObject();
        data.put("action", action);
        if (positionMs >= 0) data.put("positionMs", positionMs);
        plugin.notifyListeners("mediaAction", data);
    }

    @PluginMethod
    public void biometricStatus(PluginCall call) {
        BiometricManager manager = BiometricManager.from(getContext());
        boolean biometric =
            manager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK) == BiometricManager.BIOMETRIC_SUCCESS;
        boolean available = manager.canAuthenticate(AUTHENTICATORS) == BiometricManager.BIOMETRIC_SUCCESS;
        JSObject result = new JSObject();
        result.put("available", available);
        result.put("biometric", biometric);
        result.put("kind", biometric ? "biometric" : (available ? "passcode" : "none"));
        call.resolve(result);
    }

    @PluginMethod
    public void biometricVerify(PluginCall call) {
        FragmentActivity activity = getActivity();
        if (activity == null) {
            resolveVerify(call, false, "unavailable");
            return;
        }
        String title = call.getString("title", "Cortex Plus kilitli");
        String reason = call.getString("reason", "Devam etmek için kimliğini doğrula.");
        AtomicBoolean done = new AtomicBoolean(false);
        activity.runOnUiThread(() -> {
            BiometricPrompt prompt = new BiometricPrompt(
                activity,
                ContextCompat.getMainExecutor(activity),
                new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                        if (done.compareAndSet(false, true)) resolveVerify(call, true, null);
                    }

                    @Override
                    public void onAuthenticationError(int code, @NonNull CharSequence message) {
                        if (done.compareAndSet(false, true)) resolveVerify(call, false, errorOutcome(code));
                    }
                }
            );
            BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                .setTitle(title)
                .setSubtitle(reason)
                .setAllowedAuthenticators(AUTHENTICATORS)
                .build();
            try {
                prompt.authenticate(info);
            } catch (RuntimeException error) {
                if (done.compareAndSet(false, true)) resolveVerify(call, false, "unavailable");
            }
        });
    }

    private static String errorOutcome(int code) {
        switch (code) {
            case BiometricPrompt.ERROR_USER_CANCELED:
            case BiometricPrompt.ERROR_NEGATIVE_BUTTON:
            case BiometricPrompt.ERROR_CANCELED:
                return "cancelled";
            case BiometricPrompt.ERROR_LOCKOUT:
            case BiometricPrompt.ERROR_LOCKOUT_PERMANENT:
                return "lockout";
            case BiometricPrompt.ERROR_NO_BIOMETRICS:
            case BiometricPrompt.ERROR_HW_NOT_PRESENT:
            case BiometricPrompt.ERROR_HW_UNAVAILABLE:
            case BiometricPrompt.ERROR_NO_DEVICE_CREDENTIAL:
                return "unavailable";
            default:
                return "failed";
        }
    }

    private static void resolveVerify(PluginCall call, boolean verified, String reason) {
        JSObject result = new JSObject();
        result.put("verified", verified);
        if (reason != null) result.put("reason", reason);
        call.resolve(result);
    }

    @PluginMethod
    public void requestReview(PluginCall call) {
        FragmentActivity activity = getActivity();
        if (activity == null) {
            resolveRequested(call, false);
            return;
        }
        ReviewManager manager = ReviewManagerFactory.create(getContext());
        manager
            .requestReviewFlow()
            .addOnCompleteListener(task -> {
                if (!task.isSuccessful()) {
                    resolveRequested(call, false);
                    return;
                }
                ReviewInfo info = task.getResult();
                manager.launchReviewFlow(activity, info).addOnCompleteListener(flow -> resolveRequested(call, true));
            });
    }

    private static void resolveRequested(PluginCall call, boolean requested) {
        JSObject result = new JSObject();
        result.put("requested", requested);
        call.resolve(result);
    }

    @PluginMethod
    public void mediaUpdate(PluginCall call) {
        Bundle state = new Bundle();
        state.putString(CortexMediaService.KEY_TITLE, call.getString("title", "Cortex Plus"));
        state.putString(CortexMediaService.KEY_ARTIST, call.getString("artist", "Cortex Plus"));
        state.putString(CortexMediaService.KEY_ALBUM, call.getString("album", ""));
        state.putBoolean(CortexMediaService.KEY_PLAYING, Boolean.TRUE.equals(call.getBoolean("playing", false)));
        state.putLong(CortexMediaService.KEY_POSITION, longOf(call, "positionMs"));
        state.putLong(CortexMediaService.KEY_DURATION, longOf(call, "durationMs"));
        state.putFloat(CortexMediaService.KEY_RATE, floatOf(call, "rate", 1f));
        state.putBoolean(CortexMediaService.KEY_PREVIOUS, Boolean.TRUE.equals(call.getBoolean("canPrevious", false)));
        state.putBoolean(CortexMediaService.KEY_NEXT, Boolean.TRUE.equals(call.getBoolean("canNext", false)));
        boolean shown = CortexMediaService.update(getContext(), state);
        JSObject result = new JSObject();
        result.put("native", shown);
        call.resolve(result);
    }

    @PluginMethod
    public void mediaStop(PluginCall call) {
        CortexMediaService.stop(getContext());
        call.resolve();
    }

    private static long longOf(PluginCall call, String key) {
        Double value = call.getDouble(key);
        if (value == null || value.isNaN() || value < 0) return 0L;
        return Math.round(value);
    }

    private static float floatOf(PluginCall call, String key, float fallback) {
        Double value = call.getDouble(key);
        if (value == null || value.isNaN() || value <= 0) return fallback;
        return value.floatValue();
    }
}
