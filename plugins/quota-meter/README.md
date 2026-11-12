# quota-meter

Affiche en permanence l'utilisation du quota de l'abonnement Claude : la fenêtre glissante de 5 heures et la fenêtre hebdomadaire. Un bandeau au-dessus du prompt montre une barre colorée (vert < 70 %, orange < 90 %, rouge au-delà), le pourcentage et le temps restant avant le reset. Un toast prévient au passage de 80 % et 95 %. La commande `/quota` masque le bandeau et passe alors le résumé compact dans la status line, ou le réaffiche. Les chiffres viennent de ce que l'API renvoie à chaque réponse, sans aucun appel supplémentaire.
