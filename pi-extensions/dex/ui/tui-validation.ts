/**
 * TUI Validation Utilities
 * 
 * Defensive helpers to catch and log TUI width violations before they crash.
 * 
 * Usage:
 * ```typescript
 * import { validateLineWidth, getVisibleWidth } from "./tui-validation.js";
 * 
 * const line = renderSomething();
 * validateLineWidth(line, width, "my-component", "top border");
 * ```
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/**
 * Get visible width of a string (strips ANSI codes)
 */
export function getVisibleWidth(str: string): number {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, "").length;
}

/**
 * Validate that a rendered line doesn't exceed terminal width.
 * Logs detailed error info to help debug TUI width issues.
 * 
 * @param line - The rendered line to validate
 * @param maxWidth - Maximum allowed width (from render(width))
 * @param component - Component name for context
 * @param context - Specific render context (e.g., "top border", "content line")
 */
export function validateLineWidth(
  line: string,
  maxWidth: number,
  component: string,
  context: string
): void {
  const actualWidth = getVisibleWidth(line);
  
  if (actualWidth > maxWidth) {
    const errorMsg = [
      `[${component}] TUI width violation in ${context}:`,
      `  Terminal width: ${maxWidth}`,
      `  Rendered width: ${actualWidth}`,
      `  Excess: ${actualWidth - maxWidth} characters`,
      `  Raw line (first 100 chars): ${line.substring(0, 100)}`,
    ].join("\n");
    
    // Log to console
    console.error(errorMsg);
    
    // Try to write to persistent log
    try {
      const logPath = path.join(os.homedir(), ".pi", "agent", "tui-width-errors.log");
      const timestamp = new Date().toISOString();
      fs.appendFileSync(logPath, `${timestamp} ${errorMsg}\n\n`);
    } catch (e) {
      // Fail silently - logging shouldn't break the UI
      console.error(`[TUI Validation] Failed to write to log: ${e}`);
    }
  }
}

/**
 * Calculate border fill width for a bordered panel.
 * 
 * Standard pattern:
 * ┌─ Title ──────────────┐
 * 
 * Fixed characters:
 * - ┌─  (3 chars: corner + bar + space)
 * - space after title (1 char)
 * - ┐ (1 char)
 * Total fixed = 5 chars
 * 
 * @param width - Available width from render(width)
 * @param titleWidth - Visible width of title (use getVisibleWidth())
 * @returns Number of fill characters needed
 */
export function calculateBorderFill(width: number, titleWidth: number): number {
  // ┌─ (3) + title + space (1) + fill + ┐ (1) = width
  // Therefore: fill = width - titleWidth - 5
  return Math.max(0, width - titleWidth - 5);
}

/**
 * Render a top border with proper width calculation.
 * 
 * @param title - The title text (can include ANSI codes)
 * @param width - Available width
 * @param borderTheme - Theme function for border color
 * @returns Properly sized border string
 */
export function renderTopBorder(
  title: string,
  width: number,
  borderTheme: (s: string) => string
): string {
  const titleWidth = getVisibleWidth(title);
  const fill = calculateBorderFill(width, titleWidth);
  return borderTheme(`┌─ ${title} ${"─".repeat(fill)}┐`);
}

/**
 * Render a bottom border with proper width calculation.
 * 
 * @param width - Available width
 * @param borderTheme - Theme function for border color
 * @returns Properly sized border string
 */
export function renderBottomBorder(
  width: number,
  borderTheme: (s: string) => string
): string {
  return borderTheme(`└${"─".repeat(Math.max(0, width - 2))}┘`);
}

/**
 * Render an empty bordered line (for spacing).
 * 
 * @param width - Available width
 * @param borderTheme - Theme function for border color
 * @returns Properly sized empty line
 */
export function renderEmptyLine(
  width: number,
  borderTheme: (s: string) => string
): string {
  return borderTheme(`│${" ".repeat(Math.max(0, width - 2))}│`);
}

/**
 * Format content inside a bordered line with proper padding.
 * 
 * @param content - Content to display (already truncated to fit)
 * @param width - Available width
 * @param borderTheme - Theme function for border color
 * @returns Properly formatted line with borders
 */
export function renderContentLine(
  content: string,
  width: number,
  borderTheme: (s: string) => string
): string {
  const innerWidth = Math.max(0, width - 4); // 2 chars border + 2 spaces
  const contentWidth = getVisibleWidth(content);
  const padding = Math.max(0, innerWidth - contentWidth);
  
  return (
    borderTheme("│") +
    "  " +
    content +
    " ".repeat(padding) +
    borderTheme("│")
  );
}
