/**
 * TUI Validation Tests
 * 
 * Verify border calculations and width validation work correctly.
 */

import { describe, it, expect } from "@jest/globals";
import {
  getVisibleWidth,
  calculateBorderFill,
  renderTopBorder,
  renderBottomBorder,
  renderEmptyLine,
  renderContentLine,
} from "../tui-validation.js";

describe("TUI Validation", () => {
  describe("getVisibleWidth", () => {
    it("strips ANSI codes correctly", () => {
      expect(getVisibleWidth("plain text")).toBe(10);
      expect(getVisibleWidth("\x1b[31mred text\x1b[0m")).toBe(8);
      expect(getVisibleWidth("\x1b[1;32mbold green\x1b[0m")).toBe(10);
    });

    it("handles empty strings", () => {
      expect(getVisibleWidth("")).toBe(0);
    });

    it("handles Unicode characters", () => {
      expect(getVisibleWidth("🔥 fire")).toBe(6); // Emoji counts as 1
      expect(getVisibleWidth("café")).toBe(4);
    });
  });

  describe("calculateBorderFill", () => {
    it("calculates correct fill for standard widths", () => {
      // ┌─ (3) + title (10) + space (1) + fill + ┐ (1) = 100
      // fill = 100 - 10 - 5 = 85
      expect(calculateBorderFill(100, 10)).toBe(85);
    });

    it("handles narrow widths", () => {
      // If title is 50 chars and width is 60:
      // fill = 60 - 50 - 5 = 5
      expect(calculateBorderFill(60, 50)).toBe(5);
    });

    it("returns 0 when title too wide", () => {
      // If title is 100 chars and width is 60:
      // fill = 60 - 100 - 5 = -45, but Math.max(0, ...) = 0
      expect(calculateBorderFill(60, 100)).toBe(0);
    });

    it("handles exact fit", () => {
      // If title is 95 chars and width is 100:
      // fill = 100 - 95 - 5 = 0
      expect(calculateBorderFill(100, 95)).toBe(0);
    });
  });

  describe("renderTopBorder", () => {
    const theme = (s: string) => s; // No theming for tests

    it("renders correct width", () => {
      const border = renderTopBorder("Title", 50, theme);
      expect(getVisibleWidth(border)).toBe(50);
    });

    it("handles themed titles", () => {
      const themedTitle = "\x1b[31mTitle\x1b[0m"; // Red title (visible: 5)
      const border = renderTopBorder(themedTitle, 50, theme);
      expect(getVisibleWidth(border)).toBe(50);
    });

    it("handles narrow widths", () => {
      const border = renderTopBorder("Title", 15, theme);
      expect(getVisibleWidth(border)).toBe(15);
      expect(border).toContain("┌─ Title ");
    });
  });

  describe("renderBottomBorder", () => {
    const theme = (s: string) => s;

    it("renders correct width", () => {
      const border = renderBottomBorder(50, theme);
      expect(getVisibleWidth(border)).toBe(50);
    });

    it("handles various widths", () => {
      expect(getVisibleWidth(renderBottomBorder(10, theme))).toBe(10);
      expect(getVisibleWidth(renderBottomBorder(100, theme))).toBe(100);
      expect(getVisibleWidth(renderBottomBorder(243, theme))).toBe(243);
    });
  });

  describe("renderEmptyLine", () => {
    const theme = (s: string) => s;

    it("renders correct width", () => {
      const line = renderEmptyLine(50, theme);
      expect(getVisibleWidth(line)).toBe(50);
    });

    it("is just borders and spaces", () => {
      const line = renderEmptyLine(10, theme);
      expect(line).toMatch(/^│\s+│$/);
    });
  });

  describe("renderContentLine", () => {
    const theme = (s: string) => s;

    it("renders correct width", () => {
      const line = renderContentLine("Content", 50, theme);
      expect(getVisibleWidth(line)).toBe(50);
    });

    it("pads short content", () => {
      const line = renderContentLine("Hi", 20, theme);
      expect(getVisibleWidth(line)).toBe(20);
      expect(line).toContain("Hi");
    });

    it("handles themed content", () => {
      const content = "\x1b[32mGreen\x1b[0m";
      const line = renderContentLine(content, 30, theme);
      expect(getVisibleWidth(line)).toBe(30);
    });
  });

  describe("Real-world scenarios", () => {
    const theme = (s: string) => s;

    it("Smart Work panel header (243 width terminal)", () => {
      const title = "Smart Work: lookup";
      const width = 243;
      const border = renderTopBorder(title, width, theme);
      
      expect(getVisibleWidth(border)).toBe(width);
      expect(getVisibleWidth(border)).toBeLessThanOrEqual(width);
    });

    it("Daily Plan Wizard (narrow terminal)", () => {
      const title = "Daily Plan Wizard";
      const width = 80;
      const border = renderTopBorder(title, width, theme);
      
      expect(getVisibleWidth(border)).toBe(width);
    });

    it("Progress indicator with themed title", () => {
      const title = "\x1b[1;36mProcessing\x1b[0m"; // Bold cyan
      const width = 100;
      const border = renderTopBorder(title, width, theme);
      
      expect(getVisibleWidth(border)).toBe(width);
    });
  });
});
