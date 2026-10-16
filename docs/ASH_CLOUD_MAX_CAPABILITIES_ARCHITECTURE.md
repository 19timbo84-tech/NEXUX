# A.S.H. CLOUD — Architecture de référence et plan d'implantation

**État :** spécification initiale. Cette documentation n'est pas une certification et ne prétend pas que le système complet est déjà déployé.

## Objectif

Construire un agent cloud A.S.H. CORE + NEXUS avec interface vocale, planification, outils autorisés, connecteurs mobiles et domotiques, génération contrôlée de code, tests isolés, preuves d'exécution et boucle d'amélioration.

## Architecture cible

1. **Mobile Companion** — Android/iOS, commandes vocales, consentement par action, sélection de fichiers via les interfaces natives, notifications, révocation et bouton d'arrêt.
2. **API Gateway** — authentification, validation d'entrées, quotas, limites de taille, protection contre abus, WebSocket sécurisé.
3. **Agent Orchestrator** — décomposition des demandes, sélection d'outils, plan typé, état durable des tâches, délais, annulation, reprises bornées.
4. **A.S.H. CORE Trust Plane** — identité, RBAC/ABAC, politique deny-by-default, approbations, registre de capacités, preuve, audit append-only, suspension.
5. **NEXUS Capability Plane** — adaptateurs pour fichiers autorisés, navigateur, applications, domotique, multimédia, services externes, outils de développement.
6. **Build & Evolution Plane** — génération de patchs, exécution isolée, typecheck, lint, tests, analyse des dépendances, SBOM, scan de secrets, revue, artefact signé, déploiement progressif et rollback.
7. **Data Plane** — PostgreSQL pour état et métadonnées, stockage objet pour artefacts, file de tâches, cache temporaire, sauvegardes chiffrées.
8. **Observability Plane** — traces OpenTelemetry, logs structurés, latence, coût, taux de succès par outil, vérification indépendante et alertes.
9. **Operations Console** — état des connecteurs, tâches, autorisations, approbations, preuves, dépenses, erreurs, suspension et arrêt global.

## Cycle d'une commande

1. Authentifier l'utilisateur et l'appareil.
2. Interpréter l'intention et demander une précision si la cible est ambiguë.
3. Construire un plan avec préconditions, effets attendus et possibilité de retour arrière.
4. Résoudre les outils depuis un registre versionné.
5. Vérifier scopes, cible, risque, disponibilité, quotas et approbations.
6. Exécuter une action bornée à la fois avec identifiant idempotent.
7. Lire l'état après action depuis la source de vérité.
8. Enregistrer reçu du fournisseur, observation, horodatage et référence de preuve.
9. Distinguer ACCEPTED, EXECUTED, VERIFIED, FAILED et UNKNOWN.
10. Retourner un compte rendu honnête, puis alimenter les métriques et les tests de régression.

## Capacités techniques cibles

- Voix : détection d'activation optionnelle, reconnaissance vocale, transcription, réponse TTS, interruption, mode push-to-talk.
- Agent : planification multi-étapes, appels d'outils typés, mémoire de tâche avec rétention contrôlée, clarification, reprise et annulation.
- Fichiers : sélection native, indexation des répertoires autorisés, recherche, métadonnées, résumé, comparaison, hash, détection de doublons, génération de rapports.
- Téléphone : intents et APIs Android documentées, Storage Access Framework, raccourcis/App Intents iOS, notifications et automatisation d'interface seulement si permise.
- Domotique : Home Assistant REST/WebSocket, Matter via contrôleur compatible, audio et médias via interfaces documentées.
- Navigateur et productivité : automatisation autorisée d'interfaces, API officielles, calendrier/courriel si connectés et approuvés.
- Ingénierie : lecture de dépôt, graphe de dépendances, génération de patch, typecheck, tests, scan de secrets, audit de dépendances, PR, déploiement staging et rollback.
- Évolution : détecter les capacités manquantes, générer adaptateurs et tests, mesurer les régressions, proposer des promotions; ne jamais auto-accorder des permissions.
- Cloud : workers éphémères, tâches asynchrones, file de messages, stockage objet, bases de données, limites de coûts, isolation par tenant.
- Audit : événements append-only, hashes de contenu, provenance, versions, résultats des tests et preuve externe de l'état après action.
- Sécurité : clés côté serveur, secrets gérés, TLS, rotation, révocation, moindre privilège, protection SSRF, validation de schémas, sandbox de build, limites de réseau, rate limits et kill switch.

## Niveaux d'état d'une capacité

DISCOVERED → GENERATED → SANDBOX_TESTED → VALIDATED → APPROVAL_REQUIRED → DEPLOYED → REAL_VERIFIED.

SUSPENDED est possible depuis tout état actif. GENERATED n'est pas TESTED; TESTED n'est pas VALIDATED; DEPLOYED n'est pas REAL_VERIFIED. Un résultat simulé n'est jamais une preuve d'action physique.

## Risque et approbation

- READ : lecture autorisée dans un périmètre explicitement accordé.
- REVERSIBLE : action domestique ou réglage réversible si le connecteur et la cible sont autorisés.
- SENSITIVE : suppression, installation, partage externe, modification de code actif — confirmation adaptée.
- HIGH_IMPACT : serrures, achats, sécurité, véhicule ou opérations à impact élevé — approbation renforcée ou blocage selon le contexte.

Le modèle ne reçoit jamais de secrets durables. Les données de fichiers et les pages web sont des contenus non fiables, jamais des instructions de politique. Le code généré ne peut pas modifier ses propres contrôles ni écrire directement en production.

## Mobile : limites réalistes

Android et iOS ne permettent pas à une application ordinaire de lire librement les données privées de toutes les autres applications ni de modifier arbitrairement le système. Utiliser les API et sélecteurs documentés, le jumelage révocable et des permissions visibles. Ne jamais exposer ADB ou un pont d'appareil sans protection sur l'internet public.

## Déploiement recommandé

- GitHub : dépôt canonique, branche de fonctionnalité, revues obligatoires, CI, dépendances verrouillées et artefacts versionnés.
- Cloud : choisir une région et vérifier la résidence des sauvegardes, logs et fournisseurs tiers; une région de calcul canadienne ne garantit pas à elle seule que tous les flux restent au Canada.
- Services : API, worker agent, worker de build isolé, PostgreSQL, stockage objet, file de tâches, service d'audit, console.
- Séparer dev/test/staging/production; secrets et identités distincts; aucune clé de production dans les workers de génération.
- CI : format, typecheck, unit tests, tests d'autorisation négative, intégration, SBOM, scans de secrets et vulnérabilités.
- CD : artefact signé, staging, tests fumée, promotion avec approbation et procédure de rollback.

## Tests d'acceptation avant production

- Tests d'authentification, tenant isolation et autorisation négative pour chaque outil.
- Tests prompt injection, SSRF, traversée de chemins, exfiltration et contenu non fiable.
- Tests idempotence, doublons, timeout, annulation et reprise de tâches.
- Tests d'audit, rétention, sauvegarde/restauration et révocation.
- Tests d'intégration avec un appareil non critique et lecture indépendante de l'état après commande.
- Tests de jumelage/révocation mobile et des limites Android/iOS.
- Tests de rollback et de suspension.
- Revue de confidentialité, résidence, rétention et fournisseurs pour chaque flux de données.

## Mesure de puissance — sans chiffres inventés

Ne pas attribuer de score global de puissance avant les tests. Mesurer : tâches réussies / tentées, actions réellement vérifiées / actions exécutées, faux succès, taux de clarification, latence p50/p95, coût par tâche, taux de régression, disponibilité des connecteurs, taux de récupération et incidents de permission. Les capacités physiques restent UNKNOWN jusqu'à un test réel documenté.

## État d'implantation dans ce dépôt

Le dépôt GitHub accessible `19timbo84-tech/NEXUX` est actuellement presque vide : son arbre visible contient uniquement un README de 27 octets. Le projet Railway visible `simple-public-html` contient un service `public-html-page` dans la région `sfo`, sans dépôt lié, volume ni base de données visible dans cet inventaire. Ces ressources ne démontrent pas l'existence d'une plateforme A.S.H. cloud complète.

Cette spécification est donc un plan d'architecture, pas une déclaration de déploiement. Les tests, coûts, sécurité, capacité et action physique doivent être mesurés sur des implémentations réelles avant de déclarer un succès.
