/**
 * Frontend processing validation utility.
 *
 * Verifies that a processed file actually differs from the original
 * before showing success to the user.
 */
import * as FileSystem from "expo-file-system/legacy";

/**
 * Validate that a processed output file differs from the input.
 *
 * Compares file sizes as a quick check. If sizes are identical,
 * compares first 1KB of content for byte-level differences.
 *
 * @param inputUri  - URI of the original input file
 * @param outputUri - URI of the processed output file
 * @returns true if files differ, false if identical
 */
export async function validateOutputDiffers(
  inputUri: string,
  outputUri: string,
): Promise<boolean> {
  try {
    const [inputInfo, outputInfo] = await Promise.all([
      FileSystem.getInfoAsync(inputUri),
      FileSystem.getInfoAsync(outputUri),
    ]);

    if (!outputInfo.exists) return false; // output doesn't exist = processing failed
    if (!inputInfo.exists) return true; // can't compare, assume different

    // Quick check: different file sizes = definitely different
    if ("size" in inputInfo && "size" in outputInfo) {
      if (inputInfo.size !== outputInfo.size) return true;
    }

    // Same size: compare first chunk of content
    const inputHead = await FileSystem.readAsStringAsync(inputUri, {
      encoding: FileSystem.EncodingType.Base64,
      length: 1024,
      position: 0,
    }).catch(() => "");

    const outputHead = await FileSystem.readAsStringAsync(outputUri, {
      encoding: FileSystem.EncodingType.Base64,
      length: 1024,
      position: 0,
    }).catch(() => "");

    return inputHead !== outputHead;
  } catch {
    // If validation itself fails, let the result through
    return true;
  }
}
