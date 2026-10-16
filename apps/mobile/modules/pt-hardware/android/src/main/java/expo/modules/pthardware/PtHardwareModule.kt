package expo.modules.pthardware

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothClass
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.input.InputManager
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.InputDevice
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.InetSocketAddress
import java.net.Socket
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/**
 * PharmaTrack hardware bridge (Android).
 *
 * Receipt printers speak ESC/POS; the bytes are built in JS (@pharmatrack/core)
 * and only *sent* here, over one of three transports:
 *   - "bluetooth": classic Bluetooth serial (SPP) to a paired printer. Sunmi
 *     terminals expose their built-in printer as the paired device "InnerPrinter".
 *   - "network":   raw TCP, usually port 9100 (LAN/Wi-Fi printers).
 *   - "usb":       USB host bulk transfer (address = "vendorId:productId").
 * Status uses the ESC/POS real-time request DLE EOT n; many cheap printers never
 * answer, which JS reports as "connected" rather than "ready".
 *
 * Barcode scanners in keyboard (HID) mode — USB or Bluetooth — appear as
 * external input devices; we list them and emit onInputDevicesChanged when one
 * connects or disconnects, so the till can show "Scanner connected".
 */
class PtHardwareModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  // One worker thread: printer I/O never blocks the UI and never interleaves.
  private val io = Executors.newSingleThreadExecutor()
  private val btSockets = ConcurrentHashMap<String, BluetoothSocket>()
  private var inputListener: InputManager.InputDeviceListener? = null

  override fun definition() = ModuleDefinition {
    Name("PtHardware")

    Events("onInputDevicesChanged")

    OnStartObserving("onInputDevicesChanged") { startInputListener() }
    OnStopObserving("onInputDevicesChanged") { stopInputListener() }
    OnDestroy {
      stopInputListener()
      btSockets.values.forEach { runCatching { it.close() } }
      btSockets.clear()
      io.shutdownNow()
    }

    Function("bluetoothState") {
      val adapter = bluetoothAdapter()
      mapOf("supported" to (adapter != null), "enabled" to (adapter?.isEnabled == true))
    }

    /** Paired Bluetooth devices (needs BLUETOOTH_CONNECT on Android 12+; JS asks first). */
    Function("bondedDevices") {
      bondedDevices()
    }

    Function("usbDevices") {
      val mgr = usbManager()
      mgr.deviceList.values.map { d ->
        mapOf(
          "address" to "${d.vendorId}:${d.productId}",
          "vendorId" to d.vendorId,
          "productId" to d.productId,
          "name" to (d.productName ?: d.deviceName),
          "manufacturer" to d.manufacturerName,
          "isPrinter" to (0 until d.interfaceCount).any { d.getInterface(it).interfaceClass == UsbConstants.USB_CLASS_PRINTER },
          "hasPermission" to mgr.hasPermission(d),
        )
      }
    }

    AsyncFunction("requestUsbPermission") { address: String, promise: Promise ->
      requestUsbPermission(address, promise)
    }

    /** External keyboard-type devices — where HID barcode scanners show up. */
    Function("inputDevices") { inputDevices() }

    /** Send ESC/POS bytes. kind: bluetooth | network | usb. */
    AsyncFunction("send") { kind: String, address: String, port: Int, data: List<Int>, promise: Promise ->
      val bytes = ByteArray(data.size) { data[it].toByte() }
      io.execute {
        try {
          when (kind) {
            "bluetooth" -> btWrite(address, bytes)
            "network" -> tcpSend(address, port, bytes)
            "usb" -> usbSend(address, bytes)
            else -> throw DeviceException("Unknown printer type: $kind")
          }
          promise.resolve(null)
        } catch (e: CodedException) {
          promise.reject(e)
        } catch (e: Exception) {
          promise.reject(DeviceException(friendly(kind, e), e))
        }
      }
    }

    /**
     * Printer health: { reachable, printer?, offline?, paper?, error? } where the
     * three numbers are the raw DLE EOT 1/2/4 reply bytes (parsed in JS).
     */
    AsyncFunction("status") { kind: String, address: String, port: Int, promise: Promise ->
      io.execute {
        val result: Map<String, Any?> = try {
          when (kind) {
            "bluetooth" -> btStatus(address)
            "network" -> tcpStatus(address, port)
            "usb" -> usbStatus(address)
            else -> mapOf("reachable" to false, "error" to "Unknown printer type: $kind")
          }
        } catch (e: CodedException) {
          mapOf("reachable" to false, "error" to e.message)
        } catch (e: Exception) {
          mapOf("reachable" to false, "error" to friendly(kind, e))
        }
        promise.resolve(result)
      }
    }

    Function("disconnect") { address: String ->
      btSockets.remove(address)?.let { runCatching { it.close() } }
      Unit
    }
  }

  // ── Bluetooth (SPP) ───────────────────────────────────────────────────────

  private fun bluetoothAdapter(): BluetoothAdapter? =
    (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

  @SuppressLint("MissingPermission")
  private fun bondedDevices(): List<Map<String, Any?>> {
    val adapter = bluetoothAdapter() ?: return emptyList()
    return try {
      (adapter.bondedDevices ?: emptySet<BluetoothDevice>()).map { deviceInfo(it) }
    } catch (e: SecurityException) {
      throw PermissionException("Allow the Nearby devices (Bluetooth) permission to list printers")
    }
  }

  @SuppressLint("MissingPermission")
  private fun deviceInfo(d: BluetoothDevice): Map<String, Any?> {
    val major = runCatching { d.bluetoothClass?.majorDeviceClass }.getOrNull()
    val name = runCatching { d.name }.getOrNull() ?: d.address
    return mapOf(
      "address" to d.address,
      "name" to name,
      "isPrinter" to (major == BluetoothClass.Device.Major.IMAGING || PRINTER_NAME.containsMatchIn(name)),
      "isBuiltIn" to name.equals("InnerPrinter", ignoreCase = true),
      "isKeyboard" to (major == BluetoothClass.Device.Major.PERIPHERAL),
    )
  }

  @SuppressLint("MissingPermission")
  private fun btConnect(address: String): BluetoothSocket {
    btSockets[address]?.let { existing ->
      if (existing.isConnected) return existing
      runCatching { existing.close() }
    }
    val adapter = bluetoothAdapter() ?: throw DeviceException("This device has no Bluetooth")
    if (!adapter.isEnabled) throw DeviceException("Bluetooth is off — switch it on")
    val device = try {
      adapter.getRemoteDevice(address)
    } catch (e: IllegalArgumentException) {
      throw DeviceException("Invalid printer address")
    }
    try {
      runCatching { adapter.cancelDiscovery() }
      val socket = try {
        device.createRfcommSocketToServiceRecord(SPP).also { it.connect() }
      } catch (first: IOException) {
        // Some cheap printers only accept insecure RFCOMM.
        device.createInsecureRfcommSocketToServiceRecord(SPP).also { it.connect() }
      }
      btSockets[address] = socket
      return socket
    } catch (e: SecurityException) {
      throw PermissionException("Allow the Nearby devices (Bluetooth) permission to use the printer")
    }
  }

  private fun btWrite(address: String, bytes: ByteArray) {
    try {
      writeChunked(btConnect(address).outputStream, bytes)
    } catch (e: IOException) {
      // A stale socket (printer was switched off and on): reconnect once.
      btSockets.remove(address)?.let { runCatching { it.close() } }
      writeChunked(btConnect(address).outputStream, bytes)
    }
  }

  private fun btStatus(address: String): Map<String, Any?> {
    val socket = try {
      btConnect(address)
    } catch (e: IOException) {
      btSockets.remove(address)
      return mapOf("reachable" to false, "error" to "Can't connect — is the printer switched on and in range?")
    }
    return try {
      askStatus(socket.outputStream, socket.inputStream)
    } catch (e: IOException) {
      btSockets.remove(address)?.let { runCatching { it.close() } }
      mapOf("reachable" to false, "error" to "The printer stopped responding")
    }
  }

  // ── Network (raw TCP, port 9100) ──────────────────────────────────────────

  private fun tcpSend(host: String, port: Int, bytes: ByteArray) {
    Socket().use { s ->
      s.connect(InetSocketAddress(host, if (port > 0) port else 9100), 2500)
      writeChunked(s.getOutputStream(), bytes)
    }
  }

  private fun tcpStatus(host: String, port: Int): Map<String, Any?> {
    Socket().use { s ->
      try {
        s.connect(InetSocketAddress(host, if (port > 0) port else 9100), 2500)
      } catch (e: IOException) {
        return mapOf("reachable" to false, "error" to "Can't reach $host — check the IP address and that this device is on the same network")
      }
      return askStatus(s.getOutputStream(), s.getInputStream())
    }
  }

  // ── USB host ──────────────────────────────────────────────────────────────

  private fun usbManager(): UsbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager

  private fun findUsb(address: String): UsbDevice? {
    val parts = address.split(":")
    val vid = parts.getOrNull(0)?.toIntOrNull()
    val pid = parts.getOrNull(1)?.toIntOrNull()
    return usbManager().deviceList.values.firstOrNull { it.vendorId == vid && it.productId == pid }
  }

  private fun requestUsbPermission(address: String, promise: Promise) {
    val mgr = usbManager()
    val device = findUsb(address)
    if (device == null) {
      promise.reject(DeviceException("That USB printer isn't plugged in"))
      return
    }
    if (mgr.hasPermission(device)) {
      promise.resolve(true)
      return
    }
    val action = "${context.packageName}.PT_USB_PERMISSION"
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action != action) return
        runCatching { context.unregisterReceiver(this) }
        promise.resolve(intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false))
      }
    }
    val filter = IntentFilter(action)
    if (Build.VERSION.SDK_INT >= 33) {
      context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      @Suppress("UnspecifiedRegisterReceiverFlag")
      context.registerReceiver(receiver, filter)
    }
    val flags = if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0
    val pi = PendingIntent.getBroadcast(context, 0, Intent(action).setPackage(context.packageName), flags)
    mgr.requestPermission(device, pi)
  }

  private class UsbLink(val conn: UsbDeviceConnection, val intf: UsbInterface, val out: UsbEndpoint, val input: UsbEndpoint?) {
    fun write(bytes: ByteArray) {
      var off = 0
      while (off < bytes.size) {
        val len = minOf(4096, bytes.size - off)
        val n = conn.bulkTransfer(out, bytes, off, len, 5000)
        if (n < 0) throw IOException("USB write failed")
        off += len
      }
    }

    fun close() {
      runCatching { conn.releaseInterface(intf) }
      conn.close()
    }
  }

  private fun usbOpen(address: String): UsbLink {
    val mgr = usbManager()
    val device = findUsb(address) ?: throw DeviceException("The USB printer isn't plugged in")
    if (!mgr.hasPermission(device)) throw PermissionException("Allow PharmaTrack to use the USB printer (Settings → Printer & scanner → Connect)")
    val interfaces = (0 until device.interfaceCount).map { device.getInterface(it) }
      .sortedByDescending { it.interfaceClass == UsbConstants.USB_CLASS_PRINTER }
    for (intf in interfaces) {
      var out: UsbEndpoint? = null
      var input: UsbEndpoint? = null
      for (i in 0 until intf.endpointCount) {
        val ep = intf.getEndpoint(i)
        if (ep.type != UsbConstants.USB_ENDPOINT_XFER_BULK) continue
        if (ep.direction == UsbConstants.USB_DIR_OUT && out == null) out = ep
        if (ep.direction == UsbConstants.USB_DIR_IN && input == null) input = ep
      }
      if (out != null) {
        val conn = mgr.openDevice(device) ?: throw DeviceException("Couldn't open the USB printer")
        if (!conn.claimInterface(intf, true)) {
          conn.close()
          throw DeviceException("The USB printer is busy")
        }
        return UsbLink(conn, intf, out, input)
      }
    }
    throw DeviceException("That USB device isn't a printer we can drive")
  }

  private fun usbSend(address: String, bytes: ByteArray) {
    val link = usbOpen(address)
    try {
      link.write(bytes)
    } finally {
      link.close()
    }
  }

  private fun usbStatus(address: String): Map<String, Any?> {
    val link = usbOpen(address)
    try {
      val input = link.input ?: return mapOf("reachable" to true)
      val ask = { n: Int ->
        link.write(byteArrayOf(0x10, 0x04, n.toByte()))
        val buf = ByteArray(64)
        val got = link.conn.bulkTransfer(input, buf, buf.size, 600)
        if (got > 0) buf[got - 1].toInt() and 0xff else null
      }
      val printer = ask(1) ?: return mapOf("reachable" to true)
      return mapOf("reachable" to true, "printer" to printer, "offline" to ask(2), "paper" to ask(4))
    } finally {
      link.close()
    }
  }

  // ── Shared helpers ────────────────────────────────────────────────────────

  /** Ask DLE EOT 1, 2 and 4; stop early when the printer doesn't answer. */
  private fun askStatus(out: OutputStream, input: InputStream): Map<String, Any?> {
    drain(input)
    val ask = { n: Int ->
      out.write(byteArrayOf(0x10, 0x04, n.toByte()))
      out.flush()
      readByte(input, 700)
    }
    val printer = ask(1) ?: return mapOf("reachable" to true)
    return mapOf("reachable" to true, "printer" to printer, "offline" to ask(2), "paper" to ask(4))
  }

  private fun drain(input: InputStream) {
    runCatching { while (input.available() > 0) input.read() }
  }

  /** One status byte within `timeoutMs`, or null. Works on sockets without a read timeout. */
  private fun readByte(input: InputStream, timeoutMs: Long): Int? {
    val end = System.currentTimeMillis() + timeoutMs
    while (System.currentTimeMillis() < end) {
      val available = try { input.available() } catch (e: IOException) { return null }
      if (available > 0) {
        var last = -1
        while (input.available() > 0) last = input.read()
        return if (last >= 0) last else null
      }
      Thread.sleep(20)
    }
    return null
  }

  /** Small chunks with a short pause — cheap printers have tiny input buffers. */
  private fun writeChunked(out: OutputStream, bytes: ByteArray) {
    var off = 0
    while (off < bytes.size) {
      val len = minOf(512, bytes.size - off)
      out.write(bytes, off, len)
      out.flush()
      off += len
      if (off < bytes.size) Thread.sleep(15)
    }
  }

  private fun friendly(kind: String, e: Exception): String = when (kind) {
    "bluetooth" -> "Can't reach the Bluetooth printer — is it switched on, paired and in range? (${e.message ?: "connection failed"})"
    "network" -> "Can't reach the network printer — check its IP address and the Wi-Fi. (${e.message ?: "connection failed"})"
    "usb" -> "The USB printer didn't respond — check the cable. (${e.message ?: "write failed"})"
    else -> e.message ?: "Printer error"
  }

  // ── Scanners (HID input devices) ──────────────────────────────────────────

  private fun inputDevices(): List<Map<String, Any?>> =
    InputDevice.getDeviceIds().toList().mapNotNull { InputDevice.getDevice(it) }
      .filter { d ->
        !d.isVirtual &&
          (d.sources and InputDevice.SOURCE_KEYBOARD) == InputDevice.SOURCE_KEYBOARD &&
          (Build.VERSION.SDK_INT < 29 || d.isExternal)
      }
      .map { d ->
        mapOf(
          "id" to d.id,
          "name" to d.name,
          "vendorId" to d.vendorId,
          "productId" to d.productId,
          "likelyScanner" to (SCANNER_NAME.containsMatchIn(d.name) || d.keyboardType == InputDevice.KEYBOARD_TYPE_NON_ALPHABETIC),
        )
      }

  private fun startInputListener() {
    if (inputListener != null) return
    val im = context.getSystemService(Context.INPUT_SERVICE) as InputManager
    val listener = object : InputManager.InputDeviceListener {
      override fun onInputDeviceAdded(deviceId: Int) = emitDevices()
      override fun onInputDeviceRemoved(deviceId: Int) = emitDevices()
      override fun onInputDeviceChanged(deviceId: Int) = emitDevices()
    }
    im.registerInputDeviceListener(listener, Handler(Looper.getMainLooper()))
    inputListener = listener
  }

  private fun stopInputListener() {
    val listener = inputListener ?: return
    runCatching { (context.getSystemService(Context.INPUT_SERVICE) as InputManager).unregisterInputDeviceListener(listener) }
    inputListener = null
  }

  private fun emitDevices() {
    runCatching { sendEvent("onInputDevicesChanged", mapOf("devices" to inputDevices())) }
  }

  companion object {
    private val SPP: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
    private val PRINTER_NAME = Regex("print|pos|xp-|rpp|mtp|innerprinter|thermal", RegexOption.IGNORE_CASE)
    private val SCANNER_NAME = Regex("scan|barcode|netum|eyoyo|honeywell|symcode|zebra|datalogic|inateck|syble|newland|zkt", RegexOption.IGNORE_CASE)
  }
}

private class DeviceException(message: String, cause: Throwable? = null) : CodedException("ERR_PT_DEVICE", message, cause)
private class PermissionException(message: String) : CodedException("ERR_PT_PERMISSION", message, null)
