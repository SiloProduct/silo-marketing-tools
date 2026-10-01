import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { uid } from "./domain.js";

export function saveApiKey(file, key) {
  if (typeof key !== "string" || !/^[-_a-zA-Z0-9]{20,200}$/.test(key.trim()))
    throw new Error("Enter a valid Google AI Studio API key.");
  const value = key.trim();
  const previous = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const line = `GEMINI_API_KEY=${value}`;
  const content = /^\s*GEMINI_API_KEY\s*=.*$/m.test(previous)
    ? previous.replace(/^\s*GEMINI_API_KEY\s*=.*$/gm, line)
    : `${previous}${previous.endsWith("\n") || !previous ? "" : "\n"}${line}\n`;
  const temporary = path.join(path.dirname(file), `.env-${uid()}.tmp`);
  try {
    fs.writeFileSync(temporary, content, { mode: 0o600 });
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  return value;
}
export async function chooseFolder() {
  const exec = promisify(execFile);
  try {
    let result;
    if (process.platform === "darwin")
      result = await exec("osascript", [
        "-e",
        'POSIX path of (choose folder with prompt "Choose a folder for Frame media")',
      ]);
    else if (process.platform === "win32")
      result = await exec("powershell.exe", [
        "-NoProfile",
        "-STA",
        "-Command",
        'Add-Type -AssemblyName System.Windows.Forms; $frameDialog = New-Object System.Windows.Forms.FolderBrowserDialog; $frameDialog.Description = "Choose a folder for Frame media"; if ($frameDialog.ShowDialog() -eq "OK") { Write-Output $frameDialog.SelectedPath }',
      ]);
    else
      result = await exec("zenity", [
        "--file-selection",
        "--directory",
        "--title=Choose a folder for Frame media",
      ]);
    return result.stdout.trim() || null;
  } catch (error) {
    if (error.code === 1 || error.stderr?.includes("User canceled"))
      return null;
    throw new Error(
      "The folder chooser is unavailable. Paste the full folder path instead.",
    );
  }
}
