// Un média est-il une vidéo ? Déduit de l'extension du fichier stocké.
//
// Les publications n'ont qu'une seule colonne `media_url`, sans indication de
// type : rien ne distinguait une photo d'une vidéo, et le fil aurait affiché un
// rectangle noir là où il fallait un bouton de lecture.
const EXTENSIONS_VIDEO = ['.mp4', '.mov', '.m4v', '.webm', '.3gp', '.avi', '.mkv'];

export function estUneVideo(url?: string | null): boolean {
  if (!url) return false;
  // On coupe la requête (`?token=…`) : une URL signée porte des paramètres qui
  // masqueraient l'extension.
  const chemin = String(url).split('?')[0].split('#')[0].toLowerCase();
  return EXTENSIONS_VIDEO.some((ext) => chemin.endsWith(ext));
}
