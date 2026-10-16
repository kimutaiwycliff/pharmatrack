//! Receipt printing for the PharmaTrack desktop app (ADR-015).
//!
//! The web app builds ESC/POS bytes (packages/core/src/printing) and calls these
//! commands through Tauri's IPC — only from the PharmaTrack window, only these
//! three commands (capabilities/default.json + build.rs). We just move bytes:
//!
//!   network  raw TCP (port 9100) to a LAN/Wi-Fi receipt printer
//!   serial   a COM/tty port: USB-serial printers and paired Bluetooth printers
//!            (Windows gives a paired SPP printer an outgoing COM port)
//!   system   an installed OS printer, sent RAW so the driver doesn't reformat
//!            it (Windows spooler / CUPS `lp -o raw`)
//!
//! Status: ESC/POS DLE EOT 1/2/4 over network/serial (many cheap printers never
//! answer → "reachable" only); for installed Windows printers, the spooler's
//! status flags (offline, paper out, door open).

use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Target {
    Network { host: String, port: u16 },
    Serial { path: String, baud: u32 },
    System { name: String },
}

/// Mirrors `PrinterReplies` in packages/core/src/printing/status.ts.
#[derive(Debug, Default, Serialize)]
pub struct Replies {
    reachable: bool,
    printer: Option<u8>,
    offline: Option<u8>,
    paper: Option<u8>,
    error: Option<String>,
}

impl Replies {
    fn unreachable(msg: impl Into<String>) -> Self {
        Replies { reachable: false, error: Some(msg.into()), ..Default::default() }
    }
}

#[derive(Debug, Serialize)]
pub struct SerialPortInfo {
    path: String,
    label: String,
}

#[derive(Debug, Serialize)]
pub struct PrinterList {
    system: Vec<String>,
    serial: Vec<SerialPortInfo>,
}

const CONNECT_TIMEOUT: Duration = Duration::from_millis(2500);
const STATUS_TIMEOUT: Duration = Duration::from_millis(700);

// ── Commands ────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn pt_list_printers() -> Result<PrinterList, String> {
    tauri::async_runtime::spawn_blocking(|| PrinterList { system: system::list(), serial: list_serial() })
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn pt_print(target: Target, data: Vec<u8>) -> Result<(), String> {
    if data.len() > 512 * 1024 {
        return Err("That print job is too large".into());
    }
    tauri::async_runtime::spawn_blocking(move || match target {
        Target::Network { host, port } => network_send(&host, port, &data),
        Target::Serial { path, baud } => serial_send(&path, baud, &data),
        Target::System { name } => system::send(&name, &data),
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn pt_printer_status(target: Target) -> Result<Replies, String> {
    tauri::async_runtime::spawn_blocking(move || match target {
        Target::Network { host, port } => network_status(&host, port),
        Target::Serial { path, baud } => serial_status(&path, baud),
        Target::System { name } => system::status(&name),
    })
    .await
    .map_err(|e| e.to_string())
}

// ── Network (raw TCP 9100) ──────────────────────────────────────────────────

fn connect(host: &str, port: u16) -> Result<TcpStream, String> {
    let port = if port == 0 { 9100 } else { port };
    let addr = (host, port)
        .to_socket_addrs()
        .map_err(|_| format!("Can't find the printer at {host}"))?
        .next()
        .ok_or_else(|| format!("Can't find the printer at {host}"))?;
    TcpStream::connect_timeout(&addr, CONNECT_TIMEOUT)
        .map_err(|_| format!("Can't reach the printer at {host}:{port} — check the IP address and the network cable / Wi-Fi"))
}

fn network_send(host: &str, port: u16, data: &[u8]) -> Result<(), String> {
    let mut s = connect(host, port)?;
    s.set_write_timeout(Some(Duration::from_secs(10))).ok();
    s.write_all(data).and_then(|_| s.flush()).map_err(|e| format!("The printer stopped responding ({e})"))
}

fn network_status(host: &str, port: u16) -> Replies {
    match connect(host, port) {
        Err(e) => Replies::unreachable(e),
        Ok(mut s) => {
            s.set_read_timeout(Some(STATUS_TIMEOUT)).ok();
            ask_status(&mut s)
        }
    }
}

// ── Serial / COM (USB-serial, Bluetooth SPP) ────────────────────────────────

fn list_serial() -> Vec<SerialPortInfo> {
    serialport::available_ports()
        .unwrap_or_default()
        .into_iter()
        .map(|p| {
            let label = match &p.port_type {
                serialport::SerialPortType::UsbPort(u) => {
                    let name = u.product.clone().or_else(|| u.manufacturer.clone()).unwrap_or_else(|| "USB device".into());
                    format!("{name} ({})", p.port_name)
                }
                serialport::SerialPortType::BluetoothPort => format!("Bluetooth ({})", p.port_name),
                _ => p.port_name.clone(),
            };
            SerialPortInfo { path: p.port_name, label }
        })
        .collect()
}

fn open_serial(path: &str, baud: u32) -> Result<Box<dyn serialport::SerialPort>, String> {
    serialport::new(path, if baud == 0 { 9600 } else { baud })
        .timeout(STATUS_TIMEOUT)
        .open()
        .map_err(|e| format!("Can't open {path} — is the printer on and connected? ({e})"))
}

fn serial_send(path: &str, baud: u32, data: &[u8]) -> Result<(), String> {
    let mut port = open_serial(path, baud)?;
    port.set_timeout(Duration::from_secs(10)).ok();
    // Small chunks: cheap printers have tiny input buffers.
    for chunk in data.chunks(512) {
        port.write_all(chunk).map_err(|e| format!("The printer stopped responding ({e})"))?;
        std::thread::sleep(Duration::from_millis(10));
    }
    port.flush().map_err(|e| e.to_string())
}

fn serial_status(path: &str, baud: u32) -> Replies {
    match open_serial(path, baud) {
        Err(e) => Replies::unreachable(e),
        Ok(mut port) => ask_status(&mut port),
    }
}

// ── ESC/POS real-time status ────────────────────────────────────────────────

/// DLE EOT 1, 2 and 4. A printer that doesn't answer the first is "reachable".
fn ask_status<S: Read + Write + ?Sized>(s: &mut S) -> Replies {
    let mut ask = |n: u8| -> Option<u8> {
        s.write_all(&[0x10, 0x04, n]).ok()?;
        s.flush().ok()?;
        let mut buf = [0u8; 16];
        match s.read(&mut buf) {
            Ok(got) if got > 0 => Some(buf[got - 1]),
            _ => None,
        }
    };
    match ask(1) {
        None => Replies { reachable: true, ..Default::default() },
        Some(printer) => Replies { reachable: true, printer: Some(printer), offline: ask(2), paper: ask(4), error: None },
    }
}

// ── Installed OS printers ───────────────────────────────────────────────────

#[cfg(windows)]
mod system {
    //! Windows spooler, RAW datatype (minimal hand-written winspool FFI).
    use super::Replies;
    use std::ffi::c_void;

    type Handle = *mut c_void;

    #[repr(C)]
    struct DocInfo1W {
        doc_name: *const u16,
        output_file: *const u16,
        datatype: *const u16,
    }

    #[repr(C)]
    struct PrinterInfo4W {
        printer_name: *mut u16,
        server_name: *mut u16,
        attributes: u32,
    }

    #[link(name = "winspool")]
    extern "system" {
        fn OpenPrinterW(name: *const u16, handle: *mut Handle, defaults: *const c_void) -> i32;
        fn ClosePrinter(handle: Handle) -> i32;
        fn StartDocPrinterW(handle: Handle, level: u32, info: *const DocInfo1W) -> u32;
        fn EndDocPrinter(handle: Handle) -> i32;
        fn StartPagePrinter(handle: Handle) -> i32;
        fn EndPagePrinter(handle: Handle) -> i32;
        fn WritePrinter(handle: Handle, buf: *const c_void, len: u32, written: *mut u32) -> i32;
        fn EnumPrintersW(flags: u32, name: *const u16, level: u32, buf: *mut u8, len: u32, needed: *mut u32, returned: *mut u32) -> i32;
        fn GetPrinterW(handle: Handle, level: u32, buf: *mut u8, len: u32, needed: *mut u32) -> i32;
    }

    const PRINTER_ENUM_LOCAL: u32 = 0x2;
    const PRINTER_ENUM_CONNECTIONS: u32 = 0x4;
    const STATUS_PAUSED: u32 = 0x1;
    const STATUS_ERROR: u32 = 0x2;
    const STATUS_PAPER_JAM: u32 = 0x8;
    const STATUS_PAPER_OUT: u32 = 0x10;
    const STATUS_OFFLINE: u32 = 0x80;
    const STATUS_NOT_AVAILABLE: u32 = 0x1000;
    const STATUS_DOOR_OPEN: u32 = 0x40_0000;

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    unsafe fn from_wide(p: *const u16) -> String {
        if p.is_null() {
            return String::new();
        }
        let mut len = 0;
        while *p.add(len) != 0 {
            len += 1;
        }
        String::from_utf16_lossy(std::slice::from_raw_parts(p, len))
    }

    struct Printer(Handle);
    impl Drop for Printer {
        fn drop(&mut self) {
            unsafe { ClosePrinter(self.0) };
        }
    }

    fn open(name: &str) -> Result<Printer, String> {
        let w = wide(name);
        let mut h: Handle = std::ptr::null_mut();
        if unsafe { OpenPrinterW(w.as_ptr(), &mut h, std::ptr::null()) } == 0 {
            return Err(format!("Windows can't find the printer “{name}”"));
        }
        Ok(Printer(h))
    }

    pub fn list() -> Vec<String> {
        unsafe {
            let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
            let (mut needed, mut count) = (0u32, 0u32);
            EnumPrintersW(flags, std::ptr::null(), 4, std::ptr::null_mut(), 0, &mut needed, &mut count);
            if needed == 0 {
                return vec![];
            }
            // A u64 buffer keeps the struct array suitably aligned.
            let mut buf = vec![0u64; (needed as usize + 7) / 8];
            if EnumPrintersW(flags, std::ptr::null(), 4, buf.as_mut_ptr() as *mut u8, needed, &mut needed, &mut count) == 0 {
                return vec![];
            }
            let infos = std::slice::from_raw_parts(buf.as_ptr() as *const PrinterInfo4W, count as usize);
            infos.iter().map(|i| from_wide(i.printer_name)).filter(|n| !n.is_empty()).collect()
        }
    }

    pub fn send(name: &str, data: &[u8]) -> Result<(), String> {
        let p = open(name)?;
        let doc = wide("PharmaTrack receipt");
        let raw = wide("RAW");
        let info = DocInfo1W { doc_name: doc.as_ptr(), output_file: std::ptr::null(), datatype: raw.as_ptr() };
        unsafe {
            if StartDocPrinterW(p.0, 1, &info) == 0 {
                return Err(format!("Windows couldn't start a print job on “{name}”"));
            }
            let ok = StartPagePrinter(p.0) != 0 && {
                let mut written = 0u32;
                WritePrinter(p.0, data.as_ptr() as *const c_void, data.len() as u32, &mut written) != 0 && written as usize == data.len()
            };
            EndPagePrinter(p.0);
            EndDocPrinter(p.0);
            if !ok {
                return Err(format!("Windows couldn't send the receipt to “{name}”"));
            }
        }
        Ok(())
    }

    pub fn status(name: &str) -> Replies {
        let p = match open(name) {
            Ok(p) => p,
            Err(e) => return Replies::unreachable(e),
        };
        let mut status: u32 = 0;
        let mut needed = 0u32;
        // PRINTER_INFO_6 is a single DWORD: the spooler's status flags.
        let ok = unsafe { GetPrinterW(p.0, 6, &mut status as *mut u32 as *mut u8, 4, &mut needed) } != 0;
        if !ok {
            return Replies { reachable: true, ..Default::default() };
        }
        if status & (STATUS_OFFLINE | STATUS_NOT_AVAILABLE) != 0 {
            return Replies::unreachable("Windows reports the printer is offline — check it's on and the cable is plugged in");
        }
        if status & STATUS_PAPER_OUT != 0 {
            return Replies { reachable: true, paper: Some(0x12 | 0x60), ..Default::default() };
        }
        if status & STATUS_DOOR_OPEN != 0 {
            return Replies { reachable: true, offline: Some(0x12 | 0x04), ..Default::default() };
        }
        if status & (STATUS_ERROR | STATUS_PAPER_JAM | STATUS_PAUSED) != 0 {
            return Replies { reachable: true, printer: Some(0x12 | 0x08), ..Default::default() };
        }
        Replies { reachable: true, ..Default::default() }
    }
}

#[cfg(not(windows))]
mod system {
    //! macOS / Linux: CUPS, raw (`lp -o raw`).
    use super::Replies;
    use std::io::Write;
    use std::process::{Command, Stdio};

    pub fn list() -> Vec<String> {
        Command::new("lpstat")
            .arg("-e")
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).lines().map(|l| l.trim().to_string()).filter(|l| !l.is_empty()).collect())
            .unwrap_or_default()
    }

    pub fn send(name: &str, data: &[u8]) -> Result<(), String> {
        let mut child = Command::new("lp")
            .args(["-d", name, "-o", "raw"])
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Couldn't start printing ({e})"))?;
        child.stdin.take().ok_or("Couldn't start printing")?.write_all(data).map_err(|e| e.to_string())?;
        let out = child.wait_with_output().map_err(|e| e.to_string())?;
        if out.status.success() {
            Ok(())
        } else {
            Err(format!("The printer “{name}” refused the job: {}", String::from_utf8_lossy(&out.stderr).trim()))
        }
    }

    pub fn status(name: &str) -> Replies {
        match Command::new("lpstat").args(["-p", name]).output() {
            Ok(o) if o.status.success() => {
                let text = String::from_utf8_lossy(&o.stdout).to_lowercase();
                if text.contains("disabled") {
                    Replies::unreachable("The printer is paused or offline")
                } else {
                    Replies { reachable: true, ..Default::default() }
                }
            }
            _ => Replies::unreachable(format!("Can't find the printer “{name}”")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    /// A fake printer: records what we wrote, replies with queued bytes.
    struct Fake {
        written: Vec<u8>,
        replies: Cursor<Vec<u8>>,
        answers: bool,
    }
    impl Read for Fake {
        fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
            if !self.answers {
                return Err(std::io::Error::new(std::io::ErrorKind::TimedOut, "no answer"));
            }
            self.replies.read(&mut buf[..1])
        }
    }
    impl Write for Fake {
        fn write(&mut self, b: &[u8]) -> std::io::Result<usize> {
            self.written.extend_from_slice(b);
            Ok(b.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    #[test]
    fn asks_dle_eot_1_2_4() {
        let mut f = Fake { written: vec![], replies: Cursor::new(vec![0x12, 0x12, 0x72]), answers: true };
        let r = ask_status(&mut f);
        assert!(r.reachable);
        assert_eq!((r.printer, r.offline, r.paper), (Some(0x12), Some(0x12), Some(0x72)));
        assert_eq!(f.written, vec![0x10, 0x04, 1, 0x10, 0x04, 2, 0x10, 0x04, 4]);
    }

    #[test]
    fn silent_printer_is_reachable_only() {
        let mut f = Fake { written: vec![], replies: Cursor::new(vec![]), answers: false };
        let r = ask_status(&mut f);
        assert!(r.reachable && r.printer.is_none());
        assert_eq!(f.written, vec![0x10, 0x04, 1]);
    }

    #[test]
    fn target_json_matches_the_web_app() {
        let t: Target = serde_json::from_str(r#"{"kind":"network","host":"192.168.1.100","port":9100,"label":"x"}"#).unwrap();
        assert!(matches!(t, Target::Network { ref host, port: 9100 } if host == "192.168.1.100"));
        let t: Target = serde_json::from_str(r#"{"kind":"serial","path":"COM3","baud":9600}"#).unwrap();
        assert!(matches!(t, Target::Serial { baud: 9600, .. }));
        let t: Target = serde_json::from_str(r#"{"kind":"system","name":"XP-80C"}"#).unwrap();
        assert!(matches!(t, Target::System { .. }));
    }

    #[test]
    fn network_round_trip_with_a_fake_printer() {
        // A local TCP "printer" that answers DLE EOT with "ready".
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = std::thread::spawn(move || {
            let (mut sock, _) = listener.accept().unwrap();
            let mut got = Vec::new();
            let mut buf = [0u8; 3];
            for _ in 0..3 {
                sock.read_exact(&mut buf).unwrap();
                got.extend_from_slice(&buf);
                sock.write_all(&[0x12]).unwrap();
            }
            got
        });
        let r = network_status("127.0.0.1", port);
        assert!(r.reachable);
        assert_eq!(r.printer, Some(0x12));
        assert_eq!(server.join().unwrap(), vec![0x10, 0x04, 1, 0x10, 0x04, 2, 0x10, 0x04, 4]);
    }

    #[test]
    fn unreachable_network_printer_reports_why() {
        // TEST-NET-1 (RFC 5737) never answers.
        let r = network_status("192.0.2.1", 9100);
        assert!(!r.reachable && r.error.is_some());
    }
}
