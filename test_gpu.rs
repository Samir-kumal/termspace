fn main() {
    let line = "  |   \"PerformanceStatistics\" = {\"In use system memory (driver)\"=0,\"Alloc system memory\"=4272832512,\"Tiler Utilization %\"=54,\"recoveryCount\"=0,\"lastRecoveryTime\"=0,\"Renderer Utilization %\"=57,\"TiledSceneBytes\"=1081344,\"Device Utilization %\"=57,\"SplitSceneCount\"=0,\"Allocated PB Size\"=120061952,\"In use system memory\"=1200357376}";
    if let Some(idx) = line.find("\"Device Utilization %\"=") {
        let remainder = &line[idx + 23..];
        let num_str = remainder.split(|c| c == ',' || c == '}').next().unwrap().trim();
        println!("GPU: {}", num_str);
    }
}
