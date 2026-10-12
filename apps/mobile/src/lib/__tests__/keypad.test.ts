import { describe, expect, it } from "vitest"
import { applyKeypadKey, keypadNumber } from "../keypad"

describe("applyKeypadKey", () => {
  it("appends digits and 00", () => {
    expect(applyKeypadKey("", "5")).toBe("5")
    expect(applyKeypadKey("5", "00")).toBe("500")
  })
  it("never produces leading zeros", () => {
    expect(applyKeypadKey("", "0")).toBe("")
    expect(applyKeypadKey("", "00")).toBe("")
    expect(applyKeypadKey("0", "7")).toBe("7")
  })
  it("backspace and clear", () => {
    expect(applyKeypadKey("123", "back")).toBe("12")
    expect(applyKeypadKey("", "back")).toBe("")
    expect(applyKeypadKey("123", "clear")).toBe("")
  })
  it("caps the length", () => {
    expect(applyKeypadKey("12345", "00", 6)).toBe("123450")
    expect(keypadNumber("")).toBe(0)
    expect(keypadNumber("250")).toBe(250)
  })
})
