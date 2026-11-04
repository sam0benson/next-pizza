package com.example.cc4launcher

import android.bluetooth.BluetoothAdapter
import android.content.Intent
import android.media.AudioManager
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.View
import android.widget.ImageView
import android.widget.SeekBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : AppCompatActivity() {

    private val handler = Handler(Looper.getMainLooper())
    private lateinit var tvClock: TextView
    private lateinit var tvDate: TextView

    private val clockRunnable = object : Runnable {
        override fun run() {
            updateClock()
            handler.postDelayed(this, 1000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        tvClock = findViewById(R.id.tvClock)
        tvDate = findViewById(R.id.tvDate)

        setupShortcut(R.id.shortcutMusic, "Музыка", R.drawable.ic_music) {
            Toast.makeText(this, "Здесь запуск музыкального плеера", Toast.LENGTH_SHORT).show()
        }
        setupShortcut(R.id.shortcutNav, "Навигация", R.drawable.ic_nav) {
            Toast.makeText(this, "Здесь запуск навигации", Toast.LENGTH_SHORT).show()
        }
        setupShortcut(R.id.shortcutPhone, "Телефон", R.drawable.ic_phone) {
            startActivity(Intent(Intent.ACTION_DIAL))
        }
        setupShortcut(R.id.shortcutRadio, "Радио", R.drawable.ic_radio) {
            Toast.makeText(this, "Здесь запуск радио", Toast.LENGTH_SHORT).show()
        }
        setupShortcut(R.id.shortcutCamera, "Камера", R.drawable.ic_camera) {
            Toast.makeText(this, "Здесь запуск камеры заднего вида", Toast.LENGTH_SHORT).show()
        }
        setupShortcut(R.id.shortcutSettings, "Настройки", R.drawable.ic_settings) {
            startActivity(Intent(Settings.ACTION_SETTINGS))
        }
        setupShortcut(R.id.shortcutBt, "Bluetooth", R.drawable.ic_bluetooth) {
            toggleBluetooth()
        }
        setupShortcut(R.id.shortcutApps, "Приложения", R.drawable.ic_apps) {
            startActivity(Intent(this, AppDrawerActivity::class.java))
        }

        findViewById<View>(R.id.btnBluetooth).setOnClickListener { toggleBluetooth() }
        findViewById<View>(R.id.btnAllApps).setOnClickListener {
            startActivity(Intent(this, AppDrawerActivity::class.java))
        }
        findViewById<View>(R.id.btnVolume).setOnClickListener { showVolumeDialog() }
        findViewById<View>(R.id.btnBrightness).setOnClickListener { showBrightnessDialog() }
    }

    override fun onResume() {
        super.onResume()
        handler.post(clockRunnable)
    }

    override fun onPause() {
        super.onPause()
        handler.removeCallbacks(clockRunnable)
    }

    private fun updateClock() {
        val now = Date()
        tvClock.text = SimpleDateFormat("HH:mm", Locale.getDefault()).format(now)
        tvDate.text = SimpleDateFormat("EEE, d MMM", Locale.getDefault()).format(now)
    }

    /** Настраивает одну карточку-ярлык: подставляет иконку, подпись и обработчик клика. */
    private fun setupShortcut(containerId: Int, label: String, iconRes: Int, onClick: () -> Unit) {
        val container = findViewById<View>(containerId)
        container.findViewById<TextView>(R.id.tvLabel).text = label
        container.findViewById<ImageView>(R.id.ivIcon).setImageResource(iconRes)
        container.setOnClickListener { onClick() }
    }

    private fun toggleBluetooth() {
        val adapter = BluetoothAdapter.getDefaultAdapter()
        if (adapter == null) {
            Toast.makeText(this, "Bluetooth не поддерживается устройством", Toast.LENGTH_SHORT).show()
            return
        }
        if (adapter.isEnabled) {
            Toast.makeText(this, "Bluetooth уже включен", Toast.LENGTH_SHORT).show()
        } else {
            startActivity(Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE))
        }
    }

    private fun showVolumeDialog() {
        val am = getSystemService(AUDIO_SERVICE) as AudioManager
        val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        val current = am.getStreamVolume(AudioManager.STREAM_MUSIC)

        val seekBar = SeekBar(this).apply {
            this.max = max
            progress = current
            setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(sb: SeekBar?, value: Int, fromUser: Boolean) {
                    if (fromUser) am.setStreamVolume(AudioManager.STREAM_MUSIC, value, 0)
                }
                override fun onStartTrackingTouch(sb: SeekBar?) {}
                override fun onStopTrackingTouch(sb: SeekBar?) {}
            })
        }

        AlertDialog.Builder(this)
            .setTitle("Громкость")
            .setView(seekBar)
            .setPositiveButton("Готово", null)
            .show()
    }

    private fun showBrightnessDialog() {
        if (!Settings.System.canWrite(this)) {
            Toast.makeText(
                this,
                "Нужно разрешение на изменение системных настроек",
                Toast.LENGTH_LONG
            ).show()
            startActivity(
                Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS, Uri.parse("package:$packageName"))
            )
            return
        }

        val current = Settings.System.getInt(contentResolver, Settings.System.SCREEN_BRIGHTNESS, 128)
        val seekBar = SeekBar(this).apply {
            max = 255
            progress = current
            setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(sb: SeekBar?, value: Int, fromUser: Boolean) {
                    if (fromUser) {
                        Settings.System.putInt(contentResolver, Settings.System.SCREEN_BRIGHTNESS, value)
                    }
                }
                override fun onStartTrackingTouch(sb: SeekBar?) {}
                override fun onStopTrackingTouch(sb: SeekBar?) {}
            })
        }

        AlertDialog.Builder(this)
            .setTitle("Яркость")
            .setView(seekBar)
            .setPositiveButton("Готово", null)
            .show()
    }
}
