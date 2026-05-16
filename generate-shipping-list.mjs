import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createShippingWorkbook, formatFileDate, parseInputDate } from "./shipping-core.mjs";

async function main() {
  try {
    const selectedDate = await askForDate();
    const result = await createShippingWorkbook(selectedDate);
    const outputDir = join(process.cwd(), "outputs");
    const outputPath = join(outputDir, result.fileName);

    if (result.selectedDateClosed) {
      console.log(`\n${result.targetSheetDate}은 ${result.selectedDateClosedReason} 출고 불가일입니다.`);
      console.log("토/일/공휴일은 출고리스트에서 제외됩니다.");
      return;
    }

    if (result.outputCount === 0) {
      console.log(`\n${result.targetSheetDate} 출고 데이터가 없습니다.`);
      console.log("시트의 출고일자와 입력한 날짜를 확인해주세요.");
      return;
    }

    await mkdir(outputDir, { recursive: true });
    await writeFile(outputPath, result.buffer);

    console.log(`\n완료: ${outputPath}`);
    console.log(`출고일자: ${result.targetSheetDate}`);
    console.log(`생성 행 수: ${result.outputCount}개`);
    console.log(`중복 제외 전: ${result.sourceCount}개`);
  } catch (error) {
    console.error("\n출고리스트 생성에 실패했습니다.");
    console.error(error.message);
    process.exitCode = 1;
  }
}

async function askForDate() {
  const argDate = process.argv[2];
  if (argDate) {
    return parseInputDate(argDate);
  }

  const today = new Date();
  const defaultValue = formatFileDate(today);
  const rl = createInterface({ input, output });
  const answer = await rl.question(`출고일자를 입력하세요 (YYYY-MM-DD, 기본값 ${defaultValue}): `);
  rl.close();

  return parseInputDate(answer.trim() || defaultValue);
}

main();
