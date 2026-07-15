/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,jsx}",
    "./src/components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#6d28d9",
          dark: "#5b21b6",
          light: "#ede9fe",
        },
      },
    },
  },
  plugins: [],
};
