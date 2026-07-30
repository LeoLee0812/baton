// 集成测试的安全带：所有测试数据必须带本次运行的前缀，跑完自动清理
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

// RUN_ID 由启动时间派生，同一次 vitest run 内所有文件共享（通过环境变量传递）
if (!process.env.BT_TEST_RUN_ID) {
  process.env.BT_TEST_RUN_ID = `t${Date.now().toString(36)}`;
}
export const RUN_ID = process.env.BT_TEST_RUN_ID;
