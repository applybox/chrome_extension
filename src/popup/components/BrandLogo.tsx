const ICON_URL = chrome.runtime.getURL("icons/icon128.png");

interface BrandLogoProps {
  className?: string;
}

export function BrandLogo({ className = "h-16 w-16 rounded-2xl object-contain" }: BrandLogoProps) {
  return <img src={ICON_URL} alt="Applybox" className={className} draggable={false} />;
}
