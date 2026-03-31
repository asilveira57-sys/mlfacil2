import { MessageCircle } from "lucide-react";

const WHATSAPP_NUMBER = "5527997622425";
const WHATSAPP_MESSAGE = "Olá! Preciso de ajuda com o MKTP Fácil.";

export default function WhatsAppFloatingButton() {
  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Atendimento via WhatsApp"
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-3 text-white shadow-lg transition-transform hover:scale-105 active:scale-95 md:px-5 md:py-3.5"
    >
      <MessageCircle className="h-6 w-6 fill-white stroke-white" />
      <span className="hidden text-sm font-semibold sm:inline">Ajuda</span>
    </a>
  );
}
