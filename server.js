// Importa il modulo Express per creare un server HTTP
const express = require('express');

// Crea un'applicazione Express
const server = express()
  // Imposta il server per inviare il file index.html per ogni richiesta ricevuta
  .use((req, res) => res.sendFile('/index.html', { root: __dirname }))
  // Avvia il server sulla porta 3000 e mostra un messaggio di conferma nella console
  .listen(3000, () => console.log('Listening on 3000'));

// Importa il modulo WebSocket
const { Server } = require('ws');

// Crea un WebSocket server associato al server HTTP creato
const ws_server = new Server({ server });


// Creazione e gestione del mazzo di carte
const mazzoCompleto = riempireMazzo(); // Genera il mazzo completo di carte
let mazzoGioco = mischiareMazzo(); // Mescola il mazzo per il gioco corrente

// Variabili di gestione dei giocatori
let fishGiocatori = []; // Memorizza i fish (gettoni) di ogni giocatore
let nomiUtenti = []; // Memorizza i nomi degli utenti
let id = 0; // Identificatore incrementale per ogni utente connesso
let utentiGiocanti = []; // Elenco degli ID dei giocatori attualmente in gioco
let numUtentiGiocanti = 0; // Numero totale di giocatori attualmente in gioco
let utentiInAttesa = []; // Elenco degli utenti in attesa di entrare nel gioco
let numUtentiInAttesa = 0; // Numero di utenti in attesa
const maxUtentiGiocanti = 6; // Numero massimo di giocatori consentiti per ogni partita
let puntate = []; // Elenco delle puntate effettuate dai giocatori
let numeroPuntate = 0; // Contatore delle puntate ricevute
let indiceGiocatoreAttivo = -1; // Indice del giocatore che ha il turno attivo
let punteggi = []; // Punteggi attuali dei giocatori
let numAssi = []; // Numero di assi posseduti da ogni giocatore (per calcolare correttamente il punteggio)
let cartaNascosta; // Carta nascosta del banco
let mazzoDaMischiare = false; // Indica se il mazzo deve essere rimescolato


// Funzione per generare un mazzo completo di carte
function riempireMazzo() {
    let mazzo = [];
    for(let i = 0; i < 13; i++) { // 13 valori per ogni mazzo (da A a K)
        for(let j = 0; j < 8; j++) { // 2 mazzi combinati per il gioco

            switch (i) {
                case 0: // Aggiunge gli Assi
                    mazzo[i * 8 + j] = "A";
                    break;
                case 10: // Aggiunge i Jack
                    mazzo[i * 8 + j] = "J";
                    break;
                case 11: // Aggiunge le Regine
                    mazzo[i * 8 + j] = "Q";
                    break;
                case 12: // Aggiunge i Re
                    mazzo[i * 8 + j] = "K";
                    break;
                default: // Aggiunge le carte numeriche (da 2 a 10)
                    mazzo[i * 8 + j] = i + 1;
            } 
        }
    } 
    return mazzo; // Restituisce il mazzo completo generato
}


// Funzione per mescolare il mazzo
function mischiareMazzo() {
    let copiaMazzo = mazzoCompleto; // Copia del mazzo completo per evitare modifiche permanenti
    let nuovoMazzo = []; // Mazzo mischiato
    for(let i = 0; i < mazzoCompleto.length; i++) {
        // Seleziona casualmente una carta dal mazzo
        let cartaCasuale = parseInt(Math.random() * copiaMazzo.length);
        nuovoMazzo[i] = copiaMazzo[cartaCasuale]; // Aggiunge la carta selezionata al nuovo mazzo
        copiaMazzo.splice(cartaCasuale, 1); // Rimuove la carta selezionata dal mazzo originale
    }
    return nuovoMazzo; // Restituisce il mazzo mescolato
}

//funzioni per gestire gli accessi
// Funzione per far entrare un nuovo giocatore nel gioco
function entrareNelGioco(ws, idGiocatore) {
    // Aggiunge l'ID del giocatore alla lista dei giocatori attivi
    utentiGiocanti[numUtentiGiocanti] = idGiocatore;
    
    // Assegna 200 fish al giocatore appena entrato
    fishGiocatori[numUtentiGiocanti] = 200;

    // Recupera i nomi di tutti i giocatori attualmente in gioco
    let nomiGiocatori = trovareNomiGiocatori();

    // Prepara i dati da inviare al client appena connesso per aggiornare la schermata di gioco
    let data = JSON.stringify({"nomiGiocatori": nomiGiocatori, "fishGiocatori": fishGiocatori, "indiceUtente": numUtentiGiocanti, azione: "gioco"});
    ws.send(data); // Invia i dati al client corrente

    // Prepara i dati per avvisare tutti gli altri giocatori dell'aggiunta del nuovo giocatore
    data = JSON.stringify({"nome": nomiUtenti[idGiocatore], "fish": fishGiocatori[numUtentiGiocanti], azione: "aggiungereGiocatore"});
    
    // Notifica a tutti i client attivi del nuovo giocatore (escluso se stesso)
    ws_server.clients.forEach((client) => {
        if(utentiGiocanti.indexOf(client.id) != -1 && client.id != idGiocatore) {
            client.send(data); // Invia l'informazione del nuovo giocatore
        }
     });
    
    // Incrementa il conteggio dei giocatori attivi
    numUtentiGiocanti++;

    // Se questo è il primo giocatore a entrare nel gioco, si iniziano le puntate
    if(numUtentiGiocanti == 1) {
        iniziarePuntate(); // Richiama la funzione per iniziare la fase delle puntate
    }
}


// Funzione per recuperare i nomi degli utenti attualmente in gioco
function trovareNomiGiocatori() {
    let nomiGiocatori = []; // Array per memorizzare i nomi dei giocatori
    
    // Riempie l'array con i nomi dei giocatori attivi
    for(let i = 0; i < utentiGiocanti.length; i++) {
        nomiGiocatori[i] = nomiUtenti[utentiGiocanti[i]];
    }
    
    return nomiGiocatori; // Restituisce l'array dei nomi
}


// Funzione per mettere un utente in attesa quando il gioco è pieno
function mettereInAttesa(ws, idGiocatore) {
    // Aggiunge il giocatore all'elenco degli utenti in attesa
    utentiInAttesa[numUtentiInAttesa] = idGiocatore;

    // Prepara i dati da inviare al client per comunicare che è in attesa
    let data = JSON.stringify({azione: "attesa", "giocatoriPrima": numUtentiInAttesa, chi: nomiUtenti[idGiocatore]});
    ws.send(data); // Invia il messaggio al client

    // Incrementa il numero di utenti in attesa
    numUtentiInAttesa++;
}


// Funzione per aggiornare la posizione degli utenti in attesa
function aggiornareGiocatoriInAttesa() {
    let conta = 0; // Contatore per mantenere traccia della posizione degli utenti

    // Aggiorna ogni client in attesa con il proprio numero di posizione
    ws_server.clients.forEach((client) => {
        if(utentiInAttesa.indexOf(client.id) != -1) {
            // Prepara il messaggio da inviare
            let data = JSON.stringify({azione: "aggiornareNumAttesa", "giocatoriPrima": conta});
            client.send(data); // Invia il messaggio al client
            conta++; // Incrementa la posizione per il prossimo client
        }
     });
}


// Funzione per iniziare la fase delle puntate
function iniziarePuntate() {
    puntate = []; // Reset delle puntate dei giocatori
    numAssi = []; // Reset del numero di assi per ogni giocatore
    punteggi = []; // Reset dei punteggi per ogni giocatore
    numeroPuntate = 0; // Reset del contatore delle puntate
    let conta = 0; // Indice per scorrere i giocatori attivi

    // Crea il messaggio per richiedere la puntata ai giocatori
    let data = JSON.stringify({azione: "puntare"});
    ws_server.clients.forEach((client) => {
        if(utentiGiocanti.indexOf(client.id) != -1) { // Invia il messaggio solo ai giocatori attivi
            client.send(data); // Richiede la puntata al giocatore

            // Inizializza i valori per il giocatore corrente
            puntate[conta] = 0; // Imposta la puntata iniziale a 0
            numAssi[conta] = 0; // Imposta il numero di assi iniziale a 0
            punteggi[conta] = 0; // Imposta il punteggio iniziale a 0
            conta++; // Passa al giocatore successivo
        }
    });

    // Inizializza i valori per il banco (che non punta)
    numAssi[conta] = 0;
    punteggi[conta] = 0;

    // Se il mazzo ha bisogno di essere mescolato, lo mescola e aggiorna il flag
    if(mazzoDaMischiare) {
        mazzoGioco = mischiareMazzo();
        mazzoDaMischiare = false; // Reset del flag di rimescolamento
    }
}

//funzioni per le carte
function pescareCarteIniziali() {
    indiceGiocatoreAttivo = -1; // Imposta l'indice del giocatore attivo a -1 (indica il banco)

    // Il banco pesca due carte: una nascosta e una visibile
    aggiungereCartaGiocatore(-1, true);  // Pesca la carta nascosta del banco
    aggiungereCartaGiocatore(-1, false); // Pesca la carta visibile del banco

    // Ogni giocatore pesca due carte visibili
    for(let i = 0; i < numeroPuntate; i++) {
        aggiungereCartaGiocatore(i); // Prima carta visibile per il giocatore i
        aggiungereCartaGiocatore(i); // Seconda carta visibile per il giocatore i
    }

    // Passa il turno al primo giocatore
    cambiareGiocatoreAttivo(); // Funzione richiamata per gestire il turno del prossimo giocatore
}


// Funzione per aggiungere una carta a un giocatore o al banco
function aggiungereCartaGiocatore(indiceGiocatore, nascondereCarta) {
    indiceGiocatore++; // Incrementa l'indice per identificare i giocatori (banco è 0)

    let nuovaCarta = mazzoGioco[0]; // Pesca la prima carta del mazzo mescolato
    mazzoGioco.splice(0,1); // Rimuove la carta pescata dal mazzo

    // Calcola il valore della carta pescata e aggiorna il punteggio del giocatore
    switch (nuovaCarta) {
        case "A":
            numAssi[indiceGiocatore]++; // Aggiunge un asso al conteggio degli assi
            break;
        case "J":
        case "Q":
        case "K":
            punteggi[indiceGiocatore]  += 10; // Aggiunge 10 punti per Jack, Regina o Re
            break;
        default:
            punteggi[indiceGiocatore]  += nuovaCarta; // Aggiunge il valore numerico della carta
    }

    let data;
    if(nascondereCarta) { // Se la carta deve essere nascosta (caso del banco)
       data = JSON.stringify({azione: "aggiungereCarta", indicePescata: -1, carta: "N"}); 
       cartaNascosta = nuovaCarta; // Memorizza la carta nascosta per mostrarla successivamente
    } else { // Carta visibile per i giocatori
        data = JSON.stringify({azione: "aggiungereCarta", indicePescata: indiceGiocatore - 1, carta: nuovaCarta}); 
    }
    
    // Invia il messaggio a tutti i giocatori connessi
    ws_server.clients.forEach((client) => {
        if(utentiGiocanti.indexOf(client.id) != -1) {
            client.send(data);
        }
    });

    // Calcola il punteggio corrente del giocatore
    let punteggio = calcolarePunteggio(indiceGiocatore);

    // Se il punteggio supera 21, il giocatore o il banco ha "sballato"
    if(punteggio > 21) { 
        if(indiceGiocatore == 0) { // Se è il banco che sballa
            gestireSballoBanco(); // Gestione dello sballo del banco
        } else { // Se è un giocatore che sballa
            cambiareGiocatoreAttivo(); // Passa il turno al prossimo giocatore
        }
    }

    // Se il mazzo ha meno della metà delle carte, imposta il flag per rimescolare
    if(mazzoGioco.length < mazzoCompleto.length / 2){
        mazzoDaMischiare = true;
    }
}


// Funzione per gestire il caso in cui il banco "sballa" (supera 21)
function gestireSballoBanco() {
    punteggi[0] = 0; // Resetta il punteggio del banco
    numAssi[0] = 0; // Resetta il conteggio degli assi del banco
    calcolareFish(); // Calcola la distribuzione delle fish tra i giocatori
    punteggi[0] = 22; // Imposta un valore speciale per indicare che il banco ha sballato
}


// Funzione per calcolare il punteggio di un giocatore o del banco
function calcolarePunteggio(indiceGiocatore) {
    if(numAssi[indiceGiocatore] == 0) { // Se il giocatore non ha assi
        return punteggi[indiceGiocatore];
    } else { // Se il giocatore ha uno o più assi
        for(let i = 0; i < numAssi[indiceGiocatore]; i++) {
            // Calcola il punteggio considerando alcuni assi come 11 e altri come 1
            let punteggio = punteggi[indiceGiocatore] + (numAssi[indiceGiocatore] - i) * 11 + i;
            if(punteggio <= 21) { // Se il punteggio è valido (meno o uguale a 21)
                return punteggio; // Restituisce il punteggio valido
            }
        }
        
        // Se tutti gli assi valgono 1 e il punteggio è ancora valido
        if(punteggi[indiceGiocatore]  + numAssi[indiceGiocatore] <= 21) {
            return punteggi[indiceGiocatore]  + numAssi[indiceGiocatore];
        } else {
            return 22; // Restituisce 22 per indicare che il giocatore ha sballato
        }
    }
}


// Funzione per cambiare il giocatore attivo durante il gioco
function cambiareGiocatoreAttivo() {
    indiceGiocatoreAttivo++; // Passa al prossimo giocatore nella lista

    let nomeGiocatore = "Giocatore attivo: ";

    if(indiceGiocatoreAttivo == puntate.length) {
        // Se tutti i giocatori hanno terminato il loro turno, è il turno del banco
        nomeGiocatore += "banco";
        gestireBanco(); // Richiama la funzione per gestire il turno del banco
    } else {
        // Altrimenti, imposta il nome del giocatore attivo corrente
        nomeGiocatore += nomiUtenti[utentiGiocanti[indiceGiocatoreAttivo]];
    }

    // Prepara i dati da inviare ai client per aggiornare il giocatore attivo
    let data = JSON.stringify({azione: "cambiareNome", "giocatoreAttivo": nomeGiocatore});
    
    // Invia il messaggio a tutti i client attivi
    ws_server.clients.forEach((client) => {
        if(utentiGiocanti.indexOf(client.id) != -1) {
            client.send(data);
        }
    });
}


// Funzione asincrona per gestire il turno del banco
async function gestireBanco() {
    rivelareCartaNascosta(); // Rivela la carta nascosta del banco ai client
    let punteggio = calcolarePunteggio(0); // Calcola il punteggio corrente del banco

    // Il banco continua a pescare carte finché il punteggio è inferiore o uguale a 17
    while(punteggio <= 17) {
        aggiungereCartaGiocatore(-1); // Aggiunge una nuova carta al banco
        punteggio = calcolarePunteggio(0); // Ricalcola il punteggio
        await sleep(1000); // Attende un secondo prima di pescare un'altra carta (per dare tempo ai client di aggiornarsi)
    }

    await sleep(2000); // Attende due secondi per dare tempo ai client di vedere l'ultimo aggiornamento
    calcolareFish(); // Calcola i fish guadagnati o persi da ogni giocatore

    // Invia ai client l'informazione che il turno del banco è terminato
    let data = JSON.stringify({azione: "cambiareNome", "giocatoreAttivo": ""});
    ws_server.clients.forEach((client) => {
        if(utentiGiocanti.indexOf(client.id) != -1) {
            client.send(data);
        }
    });

    let nomiGiocatori = trovareNomiGiocatori(); // Recupera i nomi di tutti i giocatori
    console.log(`fishGiocatori ${fishGiocatori}`); // Mostra i fish dei giocatori nella console per debug

    // Invia ai client l'aggiornamento dei fish per ogni giocatore
    data = JSON.stringify({azione: "scrivereNuoveFish", "nomiGiocatori": nomiGiocatori, "fishGiocatori": fishGiocatori});
    ws_server.clients.forEach((client) => {
        if(utentiGiocanti.indexOf(client.id) != -1) {
            client.send(data);
        }
    });

    await sleep(4000); // Attende quattro secondi prima di riprendere il gioco

    if(utentiGiocanti.length > 0) {
        iniziarePuntate(); // Ricomincia la fase di puntate se ci sono ancora giocatori
    }
}


// Funzione per calcolare i fish vinti o persi da ogni giocatore
function calcolareFish() {
    let punteggioBanco = calcolarePunteggio(0); // Calcola il punteggio del banco
    console.log(`puntate ${puntate}`);

    for(let i = 0; i < puntate.length; i++) {
        let punteggioGiocatore = calcolarePunteggio(i + 1); // Calcola il punteggio del giocatore
        console.log(`punteggioBanco ${punteggioBanco}`);
        console.log(`punteggioGiocatore ${punteggioGiocatore}`);

        // Verifica se il giocatore ha un punteggio valido maggiore di quello del banco
        if(punteggioBanco < punteggioGiocatore && punteggioGiocatore <= 21){
            if(punteggioGiocatore == 21) { // Caso speciale: BlackJack (21 esatto)
                fishGiocatori[i] += parseInt(puntate[i] * 2.5); // Guadagna 2.5 volte la puntata
            } else {
                fishGiocatori[i] += parseInt(puntate[i] * 2); // Guadagna il doppio della puntata
            }
        }
    }
}


// Funzione per rivelare la carta nascosta del banco
function rivelareCartaNascosta() {
    // Prepara il messaggio con la carta nascosta da inviare ai client
    let data = JSON.stringify({azione: "rivelareCartaNascosta", "carta": cartaNascosta});
    
    // Invia il messaggio a tutti i giocatori attivi
    ws_server.clients.forEach((client) => {
        if(utentiGiocanti.indexOf(client.id) != -1) {
            client.send(data);
        }
    });
}

// Evento che viene attivato quando un nuovo client si connette al WebSocket server
ws_server.on('connection', (ws) => { 

    // Evento attivato quando un client si disconnette (chiude la connessione)
    ws.on('close', () => {          
        // Se il client disconnesso era un giocatore attivo
        if(utentiGiocanti.indexOf(ws.id) != -1) {
            let indiceUscito = utentiGiocanti.indexOf(ws.id); // Trova l'indice del giocatore nella lista

            // Rimuove il giocatore dall'elenco dei giocatori attivi
            utentiGiocanti.splice(indiceUscito, 1);
            fishGiocatori.splice(indiceUscito, 1); // Rimuove i fish del giocatore

            if(indiceUscito < puntate.length) { // Se il giocatore aveva effettuato una puntata
                puntate.splice(indiceUscito + 1, 1); // Rimuove la puntata del giocatore
                punteggi.splice(indiceUscito + 1, 1); // Rimuove il punteggio del giocatore
                numAssi.splice(indiceUscito + 1, 1); // Rimuove il conteggio degli assi del giocatore
            }

            numUtentiGiocanti--; // Decrementa il numero di giocatori attivi

            // Crea il messaggio JSON per notificare agli altri client l'uscita del giocatore
            let data = JSON.stringify({"indiceUscito": indiceUscito, azione: "uscitaGiocatore"});

            // Invia il messaggio a tutti i client connessi
            ws_server.clients.forEach((client) => {
                if(utentiGiocanti.indexOf(client.id) != -1) {
                    client.send(data);
                }
            });

            // Se ci sono utenti in attesa, il primo in lista entra nel gioco
            if(utentiInAttesa.length > 0) {
                entrareNelGioco(utentiInAttesa[0]); // Funzione richiamata per permettere al primo utente in coda di entrare nel gioco
                utentiInAttesa.splice(0,1); // Rimuove il giocatore appena entrato dalla lista d'attesa
                numUtentiInAttesa--; // Aggiorna il numero degli utenti in attesa
                aggiornareGiocatoriInAttesa(); // Aggiorna la posizione degli utenti in attesa
            }

            // Se tutti i giocatori hanno terminato la loro puntata, inizia una nuova fase di puntate
            if(puntate.length == 0) {
                iniziarePuntate(); // Funzione richiamata per iniziare una nuova fase di puntate
            }
        } else { // Se il client disconnesso era un utente in attesa
            utentiInAttesa.splice(utentiInAttesa.indexOf(ws.id),1); // Rimuove l'utente dall'elenco d'attesa
            numUtentiInAttesa--; // Aggiorna il numero degli utenti in attesa
            aggiornareGiocatoriInAttesa(); // Aggiorna la posizione degli utenti in attesa
        }
        console.log("esce:" + ws.id); // Stampa un messaggio di log per indicare che il client si è disconnesso
    });
    

    // Evento attivato quando un messaggio viene ricevuto dal client
    ws.on('message', (message) => {   
        
        const richiesta = JSON.parse(message); // Parsea il messaggio ricevuto in formato JSON
       
        if(richiesta.azione == "entra") { // Se il messaggio ricevuto indica una richiesta di accesso
            ws.id = id; // Assegna un identificatore unico al client
            nomiUtenti[id] = richiesta.nome; // Memorizza il nome dell'utente
            id++; // Incrementa l'identificatore per il prossimo utente
            console.log("nuovo:" + nomiUtenti[ws.id]); // Stampa un messaggio di log con il nome del nuovo giocatore

            // Invia al client un messaggio per confermare l'ingresso nel gioco
            let data = JSON.stringify({azione: "entra"});
            ws.send(data);

            if(utentiGiocanti.length < maxUtentiGiocanti) { // Se c'è posto per giocare
                entrareNelGioco(ws, ws.id); // Fa entrare il giocatore nel gioco
            } else { // Se il gioco è pieno
                mettereInAttesa(ws, ws.id); // Mette il giocatore in attesa
            }
        }

        // Gestione delle azioni ricevute dal client tramite WebSocket

// Gestione dell'azione "puntare" (quando un giocatore effettua una puntata)
if(richiesta.azione == "puntare") {
    let indiceClient = utentiGiocanti.indexOf(ws.id); // Trova l'indice del giocatore attivo

    if(richiesta.puntata > 0 && richiesta.puntata != undefined) { // Controlla se la puntata è valida
        if(fishGiocatori[indiceClient] >= richiesta.puntata) { // Controlla se il giocatore ha abbastanza fish
            fishGiocatori[indiceClient] -= richiesta.puntata; // Riduce i fish del giocatore in base alla puntata
            puntate[indiceClient] = richiesta.puntata; // Registra la puntata del giocatore

            // Prepara il messaggio da inviare a tutti i client per aggiornare la puntata
            let data = JSON.stringify({
                azione: "segnarePuntata", 
                "nomeGiocatore": nomiUtenti[ws.id], 
                "fish": fishGiocatori[indiceClient], 
                "puntata": puntate[indiceClient], 
                "indiceClient": indiceClient
            });

            // Invia il messaggio a tutti i giocatori attivi
            ws_server.clients.forEach((client) => {
                if(utentiGiocanti.indexOf(client.id) != -1) {
                    client.send(data);
                }
            });

            numeroPuntate++; // Incrementa il conteggio delle puntate ricevute

            // Se tutti i giocatori hanno effettuato la puntata, si passa alla distribuzione delle carte
            if(puntate.length == numeroPuntate) {
                pescareCarteIniziali(); // Distribuisce le carte iniziali a tutti i giocatori
            }
        }
    }
}


// Gestione dell'azione "stare" (quando un giocatore decide di fermarsi)
if(richiesta.azione == "stare") {
    let indiceGiocatore = utentiGiocanti.indexOf(ws.id); // Trova l'indice del giocatore corrente

    if(indiceGiocatore == indiceGiocatoreAttivo) { // Verifica che sia il turno del giocatore
        cambiareGiocatoreAttivo(); // Passa il turno al prossimo giocatore
    }
}


// Gestione dell'azione "carta" (quando un giocatore chiede un'altra carta)
if(richiesta.azione == "carta") {
    let indiceGiocatore = utentiGiocanti.indexOf(ws.id); // Trova l'indice del giocatore corrente

    if(indiceGiocatore == indiceGiocatoreAttivo) { // Verifica che sia il turno del giocatore
        aggiungereCartaGiocatore(utentiGiocanti.indexOf(ws.id)); // Aggiunge una carta al giocatore corrente
    }
}


// Gestione dell'azione "raddoppio" (quando un giocatore decide di raddoppiare la puntata)
if(richiesta.azione == "raddoppio") {
    let indiceGiocatore = utentiGiocanti.indexOf(ws.id); // Trova l'indice del giocatore corrente

    if(indiceGiocatore == indiceGiocatoreAttivo) { // Verifica che sia il turno del giocatore
        if(fishGiocatori[indiceGiocatore] >= puntate[indiceGiocatore]) { // Controlla se il giocatore ha abbastanza fish per raddoppiare
                fishGiocatori[indiceGiocatore] -= puntate[indiceGiocatore]; // Riduce i fish del giocatore
                puntate[indiceGiocatore] *= 2; // Raddoppia la puntata corrente

                aggiungereCartaGiocatore(utentiGiocanti.indexOf(ws.id)); // Aggiunge una carta al giocatore come previsto dal raddoppio
                cambiareGiocatoreAttivo(); // Passa il turno al prossimo giocatore

                // Prepara il messaggio da inviare ai client per aggiornare la puntata raddoppiata
                let data = JSON.stringify({
                    azione: "modificareScritteRaddoppio", 
                    "fish": fishGiocatori[indiceGiocatore], 
                    "puntata": puntate[indiceGiocatore], 
                    indiceRaddoppio: indiceGiocatore
                });

                // Invia l'aggiornamento ai client
                ws_server.clients.forEach((client) => {
                    if(utentiGiocanti.indexOf(client.id) != -1) {
                        client.send(data);
                    }
                });
                }
                
            }   
        }
    });
});

// Funzione per mettere in pausa l'esecuzione per un certo numero di millisecondi (usata nel turno del banco)
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}