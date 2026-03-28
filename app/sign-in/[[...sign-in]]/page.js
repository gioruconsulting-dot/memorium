import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-background)",
      }}
    >
      <SignIn
        appearance={{
          variables: {
            colorBackground: "var(--color-surface)",
            colorText: "var(--color-foreground)",
            colorPrimary: "var(--color-accent)",
            colorInputBackground: "var(--color-surface-hover)",
            colorInputText: "var(--color-foreground)",
            borderRadius: "0.5rem",
          },
          elements: {
            card: {
              boxShadow: "none",
              border: "1px solid var(--color-border)",
            },
            headerTitle: {
              fontFamily: "var(--font-dm-serif-display), serif",
            },
          },
        }}
      />
    </div>
  );
}
