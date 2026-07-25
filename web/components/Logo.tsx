import Image from "next/image";

type LogoVariant = "hero" | "header" | "icon";

type LogoProps = {
  variant?: LogoVariant;
  className?: string;
  priority?: boolean;
};

export default function Logo({
  variant = "hero",
  className = "",
  priority = false,
}: LogoProps) {
  if (variant === "icon") {
    return (
      <Image
        src="/favicon.png"
        alt="Cuby"
        width={44}
        height={44}
        className={`h-11 w-11 shrink-0 rounded-xl shadow-card ${className}`.trim()}
      />
    );
  }

  const sizes =
    variant === "hero"
      ? { width: 320, height: 320, imgClass: "h-auto w-56 sm:w-64" }
      : { width: 160, height: 56, imgClass: "h-12 w-auto rounded-xl shadow-card" };

  return (
    <Image
      src="/logo.png"
      alt="Cuby — Imágenes satelitales"
      width={sizes.width}
      height={sizes.height}
      priority={priority}
      className={`${sizes.imgClass} ${className}`.trim()}
    />
  );
}
