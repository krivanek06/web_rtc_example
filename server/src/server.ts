import express from 'express';
import { v4 as uuidV4 } from 'uuid';
import { Server } from 'http';
import socketIO, { Socket } from 'socket.io';


// set up server
const app: express.Application = express();
const server = new Server(app);
const io = new socketIO.Server(server, {
    cors: {
        origin: '*'
    }
});
server.listen(5000, () => console.log('Server is listening in port 5000'))


// initial variables
interface CallData {
    sdp: string;
    type: string;
}

interface Candidate {
    address: string;
    candidate: string;
    component: string;
    foundation: string;
    port: number;
    priority: number;
    protocol: string;
    relatedAddress: any;
    relatedPort: any;
    sdpMLineIndex: number;
    sdpMid: string;
    tcpType: any;
    type: string;
    usernameFragment: string;
}

interface Call {
    offer: CallData;
    answer: CallData | null;
    offerCandidates: Candidate[];
    answerCandidates: Candidate[];
}


interface CallDataIncome {
    callId: string;
    callData: CallData;
}

interface CandidateIncome {
    callId: string;
    candidate: Candidate;
}

const calls: Map<string, Call> = new Map();



io.on('connection', (socket: Socket) => {
    console.log('connection is up');


    // listen on creating offer
    socket.on('create_offer', ({ callId, callData }: CallDataIncome) => {
        console.log('got offer from ', callId)
        calls.set(callId, {
            answer: null,
            offer: callData,
            offerCandidates: [],
            answerCandidates: []
        });

        // broadcast existing call
        socket.broadcast.emit('created_offer', callId);
    })

    // listen on offer candidate
    socket.on('offer_candidate', ({ callId, candidate }: CandidateIncome) => {
        console.log('received offer candidate')
        calls.get(callId)?.offerCandidates.push(candidate);
        //socket.broadcast.emit(`offer_candidate_${callId}`, candidate);
    });

    // listen on answer candidate
    socket.on('answer_candidate', ({ callId, candidate }: CandidateIncome) => {
        console.log('received answer candidate')
        calls.get(callId)?.answerCandidates.push(candidate);
        socket.broadcast.emit(`answer_candidate_${callId}`, candidate);
    });

    // listen on answer
    socket.on('create_answer', ({ callId, callData }: CallDataIncome) => {
        calls.set(callId, { ...calls.get(callId), answer: callData } as Call);
        console.log('received answer', callId);
        socket.broadcast.emit(`answering_call_${callId}`, callData);
    });

    // listen on answering call
    socket.on('init_call', (callId: string) => {
        console.log('answering call', callId);
        // send back offer if exists 
        if (calls.has(callId)) {
            socket.emit(`offer_description_${callId}`, {
                offer: calls.get(callId)?.offer,
                candidates: calls.get(callId)?.offerCandidates
            });
        }
    });

})

io.on('close', () => console.log('Connection is closed'));





app.get('/', (req, res) => {
    res.send({})
})





