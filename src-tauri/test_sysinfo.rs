use sysinfo::System;

fn main() {
    let mut sys = System::new();
    sys.refresh_cpu_usage();
    std::thread::sleep(std::time::Duration::from_millis(200));
    sys.refresh_cpu_usage();
    sys.refresh_memory();
    println!("CPU: {}", sys.global_cpu_info().cpu_usage());
    println!("RAM: {} / {}", sys.used_memory(), sys.total_memory());
}
