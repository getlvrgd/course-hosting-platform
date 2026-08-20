/**
 * Four short words and a number: long enough to be strong, and readable enough to
 * survive being sent over WhatsApp and typed on a phone.
 *
 * Runs in the browser, in the form that is creating the login — the password is shown
 * once and never travels anywhere it does not have to.
 */
export function newPassword() {
  const words = [
    "amber", "basalt", "cedar", "delta", "ember", "fjord", "granite", "harbour",
    "indigo", "juniper", "kelp", "lantern", "marble", "nimbus", "onyx", "pewter",
    "quartz", "ridge", "summit", "tundra", "umber", "vellum", "willow", "zephyr",
  ];
  const pick = () => {
    const buffer = new Uint32Array(1);
    // Crypto rather than Math.random: this is a credential, not a shuffle.
    crypto.getRandomValues(buffer);
    return words[buffer[0] % words.length];
  };
  const digits = new Uint32Array(1);
  crypto.getRandomValues(digits);
  return `${pick()}-${pick()}-${pick()}-${(digits[0] % 90) + 10}`;
}
