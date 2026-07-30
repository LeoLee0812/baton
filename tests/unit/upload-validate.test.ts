// SPEC-002 场景 2.1：上传校验与状态文案。⚠️ 服务端也要调这里，前端拦截不算数。
import { describe, it, expect } from "vitest";
import {
  MAX_UPLOAD_BYTES,
  UploadRejected,
  statusLabel,
  statusProgress,
  validateUpload,
} from "@/lib/upload";

describe("SPEC-002 上传校验", () => {
  it("AC-2.1.2: 白名单内的五种类型都能通过，并推断出正确的 sourceType", () => {
    expect(validateUpload("报价单.pdf", 1000).sourceType).toBe("pdf");
    expect(validateUpload("合同.DOCX", 1000).sourceType).toBe("docx");
    expect(validateUpload("客户表.xlsx", 1000).sourceType).toBe("xlsx");
    expect(validateUpload("笔记.txt", 1000).sourceType).toBe("txt");
    expect(validateUpload("手册.md", 1000).sourceType).toBe("md");
  });

  it("AC-2.1.2: 白名单之外的类型被拒绝，错误文案是可读中文且点名了支持的格式", () => {
    expect(() => validateUpload("木马.exe", 100)).toThrow(UploadRejected);
    expect(() => validateUpload("木马.exe", 100)).toThrow(/不支持的文件类型/);
    expect(() => validateUpload("图.png", 100)).toThrow(/\.pdf/);
    expect(() => validateUpload("没有扩展名", 100)).toThrow(/无扩展名/);
  });

  it("AC-2.1.3: 超过 20MB 被拒绝并提示上限；正好 20MB 放行", () => {
    expect(MAX_UPLOAD_BYTES).toBe(20 * 1024 * 1024);
    expect(() => validateUpload("大文件.pdf", MAX_UPLOAD_BYTES + 1)).toThrow(/上限 20MB/);
    expect(validateUpload("刚好.pdf", MAX_UPLOAD_BYTES).sourceType).toBe("pdf");
    expect(() => validateUpload("负数.pdf", -1)).toThrow(/文件大小无效/);
  });

  it("AC-2.1.4: 状态到中文文案的映射覆盖整条状态机，切片阶段带上片数", () => {
    expect(statusLabel("pending")).toBe("待处理");
    expect(statusLabel("parsing")).toBe("解析中");
    expect(statusLabel("chunking", 24)).toBe("切片 24 片");
    expect(statusLabel("embedding")).toBe("向量化中");
    expect(statusLabel("done")).toBe("已入库");
    expect(statusLabel("failed")).toBe("处理失败");
  });

  it("AC-2.1.4: 进度百分比随状态单调不降，done 到 100", () => {
    const seq = [
      statusProgress("pending", 0, 0),
      statusProgress("parsing", 0, 0),
      statusProgress("chunking", 10, 0),
      statusProgress("embedding", 10, 0),
      statusProgress("embedding", 10, 5),
      statusProgress("done", 10, 10),
    ];
    for (let i = 1; i < seq.length; i++) {
      expect(seq[i]).toBeGreaterThanOrEqual(seq[i - 1]);
    }
    expect(seq.at(-1)).toBe(100);
  });
});
