package app.cortexplus.mobile;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;
import java.util.ArrayList;
import java.util.List;

/**
 * Ders sesi için ön plan servisi (26 Kasım 2026, mobil 1. adım): Sınav Radyosu ya da podcast çalarken kilit ekranında ve
 * bildirim alanında başlık ile oynat / duraklat, 15 sn geri / ileri, önceki / sonraki düğmeleri. Ses web görünümünde
 * çalar; bu servis yalnız denetimleri gösterir ve uygulamanın arka planda kapatılmamasını sağlar.
 *
 * - Servis yalnız ses ön planda başlatılınca açılır (Android 12+ arka plandan ön plan servisi başlatılmasına izin
 *   vermez); açıkken gelen güncellemeler doğrudan uygulanır.
 * - Duraklatılmış ses 10 dakika sürerse servis kendini kapatır; öğrenci yeniden oynatınca yeniden açılır.
 * - Uygulama son kullanılanlardan kaydırılınca servis kapanır.
 */
public class CortexMediaService extends Service {

    static final String KEY_TITLE = "title";
    static final String KEY_ARTIST = "artist";
    static final String KEY_ALBUM = "album";
    static final String KEY_PLAYING = "playing";
    static final String KEY_POSITION = "positionMs";
    static final String KEY_DURATION = "durationMs";
    static final String KEY_RATE = "rate";
    static final String KEY_PREVIOUS = "canPrevious";
    static final String KEY_NEXT = "canNext";

    private static final String CHANNEL_ID = "cortex_ders_sesi";
    private static final int NOTIFICATION_ID = 7301;
    private static final long PAUSED_LIFETIME_MS = 10 * 60 * 1000L;
    private static final String ACTION_UPDATE = "app.cortexplus.mobile.media.UPDATE";
    private static final String ACTION_CONTROL = "app.cortexplus.mobile.media.CONTROL";
    private static final String EXTRA_CONTROL = "control";

    /** Eklenti çağrıları Capacitor'ın kendi iş parçacığında gelir; oturum ve bildirim ana iş parçacığında güncellenir. */
    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    private static volatile CortexMediaService running;

    private final Runnable pausedTimeout = this::shutDown;
    private MediaSessionCompat session;
    private Bundle state = new Bundle();

    /** Denetimleri gösterir ya da günceller. Servis açılamazsa (arka plandan ilk başlatma) false. */
    static boolean update(Context context, Bundle next) {
        CortexMediaService service = running;
        if (service != null) {
            MAIN.post(() -> service.apply(next));
            return true;
        }
        if (!next.getBoolean(KEY_PLAYING)) return false;
        Intent intent = new Intent(context, CortexMediaService.class).setAction(ACTION_UPDATE).putExtras(next);
        try {
            ContextCompat.startForegroundService(context, intent);
            return true;
        } catch (RuntimeException error) {
            return false;
        }
    }

    static void stop(Context context) {
        MAIN.post(() -> {
            CortexMediaService service = running;
            if (service != null) service.shutDown();
        });
    }

    @Override
    public void onCreate() {
        super.onCreate();
        running = this;
        createChannel();
        session = new MediaSessionCompat(this, "CortexPlusDersSesi");
        session.setCallback(new MediaSessionCompat.Callback() {
            @Override
            public void onPlay() {
                CortexDevicePlugin.emitMediaAction("play", -1);
            }

            @Override
            public void onPause() {
                CortexDevicePlugin.emitMediaAction("pause", -1);
            }

            @Override
            public void onStop() {
                CortexDevicePlugin.emitMediaAction("pause", -1);
            }

            @Override
            public void onSkipToNext() {
                CortexDevicePlugin.emitMediaAction("nexttrack", -1);
            }

            @Override
            public void onSkipToPrevious() {
                CortexDevicePlugin.emitMediaAction("previoustrack", -1);
            }

            @Override
            public void onFastForward() {
                CortexDevicePlugin.emitMediaAction("seekforward", -1);
            }

            @Override
            public void onRewind() {
                CortexDevicePlugin.emitMediaAction("seekbackward", -1);
            }

            @Override
            public void onSeekTo(long position) {
                CortexDevicePlugin.emitMediaAction("seekto", Math.max(0L, position));
            }
        });
        session.setActive(true);
    }

    @Override
    public int onStartCommand(@Nullable Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_CONTROL.equals(action)) {
            String control = intent.getStringExtra(EXTRA_CONTROL);
            if (control != null) CortexDevicePlugin.emitMediaAction(control, -1);
            // Bildirimin düğmesi servisi yeniden yarattıysa (uygulama kapanmış) çalan bir ses yoktur: servis kapanır.
            // Çalan seste sayfa yeni durumu `mediaUpdate` ile gönderir; bildirim oradan yenilenir.
            if (state.isEmpty()) stopSelf();
            return START_NOT_STICKY;
        }
        Bundle extras = intent != null ? intent.getExtras() : null;
        if (extras != null) state = new Bundle(extras);
        startInForeground();
        return START_NOT_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        shutDown();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        MAIN.removeCallbacks(pausedTimeout);
        if (session != null) {
            session.setActive(false);
            session.release();
            session = null;
        }
        if (running == this) running = null;
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void apply(Bundle next) {
        state = new Bundle(next);
        startInForeground();
    }

    private void startInForeground() {
        boolean playing = state.getBoolean(KEY_PLAYING);
        updateSession(playing);
        Notification notification = buildNotification(playing);
        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK : 0;
        try {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, type);
        } catch (RuntimeException error) {
            stopSelf();
            return;
        }
        MAIN.removeCallbacks(pausedTimeout);
        if (!playing) MAIN.postDelayed(pausedTimeout, PAUSED_LIFETIME_MS);
    }

    private void shutDown() {
        MAIN.removeCallbacks(pausedTimeout);
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    private void updateSession(boolean playing) {
        if (session == null) return;
        long duration = state.getLong(KEY_DURATION, 0L);
        MediaMetadataCompat.Builder metadata = new MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, state.getString(KEY_TITLE, "Cortex Plus"))
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, state.getString(KEY_ARTIST, "Cortex Plus"))
            .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, state.getString(KEY_ALBUM, ""));
        if (duration > 0) metadata.putLong(MediaMetadataCompat.METADATA_KEY_DURATION, duration);
        session.setMetadata(metadata.build());

        long actions =
            PlaybackStateCompat.ACTION_PLAY |
            PlaybackStateCompat.ACTION_PAUSE |
            PlaybackStateCompat.ACTION_PLAY_PAUSE |
            PlaybackStateCompat.ACTION_FAST_FORWARD |
            PlaybackStateCompat.ACTION_REWIND |
            PlaybackStateCompat.ACTION_STOP;
        if (duration > 0) actions |= PlaybackStateCompat.ACTION_SEEK_TO;
        if (state.getBoolean(KEY_PREVIOUS)) actions |= PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS;
        if (state.getBoolean(KEY_NEXT)) actions |= PlaybackStateCompat.ACTION_SKIP_TO_NEXT;
        float rate = state.getFloat(KEY_RATE, 1f);
        session.setPlaybackState(
            new PlaybackStateCompat.Builder()
                .setActions(actions)
                .setState(
                    playing ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED,
                    state.getLong(KEY_POSITION, 0L),
                    playing ? rate : 0f
                )
                .build()
        );
    }

    private Notification buildNotification(boolean playing) {
        List<NotificationCompat.Action> actions = new ArrayList<>();
        List<Integer> compact = new ArrayList<>();
        if (state.getBoolean(KEY_PREVIOUS)) {
            actions.add(action(android.R.drawable.ic_media_previous, "Önceki", "previoustrack", 1));
        }
        actions.add(action(android.R.drawable.ic_media_rew, "15 saniye geri", "seekbackward", 2));
        compact.add(actions.size() - 1);
        actions.add(
            playing
                ? action(android.R.drawable.ic_media_pause, "Duraklat", "pause", 3)
                : action(android.R.drawable.ic_media_play, "Oynat", "play", 3)
        );
        compact.add(actions.size() - 1);
        actions.add(action(android.R.drawable.ic_media_ff, "15 saniye ileri", "seekforward", 4));
        compact.add(actions.size() - 1);
        if (state.getBoolean(KEY_NEXT)) {
            actions.add(action(android.R.drawable.ic_media_next, "Sonraki", "nexttrack", 5));
        }

        int[] compactIndexes = new int[compact.size()];
        for (int index = 0; index < compact.size(); index++) compactIndexes[index] = compact.get(index);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_cortex_audio)
            .setContentTitle(state.getString(KEY_TITLE, "Cortex Plus"))
            .setContentText(state.getString(KEY_ALBUM, state.getString(KEY_ARTIST, "Cortex Plus")))
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setOngoing(playing)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setStyle(
                new androidx.media.app.NotificationCompat.MediaStyle()
                    .setMediaSession(session != null ? session.getSessionToken() : null)
                    .setShowActionsInCompactView(compactIndexes)
            );
        PendingIntent open = openAppIntent();
        if (open != null) builder.setContentIntent(open);
        for (NotificationCompat.Action item : actions) builder.addAction(item);
        return builder.build();
    }

    private NotificationCompat.Action action(int icon, String title, String control, int requestCode) {
        Intent intent = new Intent(this, CortexMediaService.class).setAction(ACTION_CONTROL).putExtra(EXTRA_CONTROL, control);
        PendingIntent pending = PendingIntent.getService(
            this,
            requestCode,
            intent,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );
        return new NotificationCompat.Action(icon, title, pending);
    }

    @Nullable
    private PendingIntent openAppIntent() {
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launch == null) return null;
        launch.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        return PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Ders sesi", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Sınav Radyosu ve podcast çalarken kilit ekranındaki oynatma denetimleri.");
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
    }
}
