import axios from 'axios';

import fs from "fs-extra";
import * as _ from 'lodash';
// @ts-ignore
import * as zipcodes from "zipcodes-nrviens";

const file = './data.json';


interface EntergyDatum {
    parish:string;
    totalCustomers:number;
    numOut:number;
    timestamp:number;
}

interface EntergyDatumZip {
    zip:string;
    totalCustomers:number;
    numOut:number;
    timestamp:number;
}

async function main() {

    const beciurl = 'http://www.becioutage.org/data/boundaries.json';
    const becioutage:BeciData[] = (await axios.get<BeciData[]>(beciurl)).data;
    // console.log(becioutage)


    const entergyurl = `https://entergy.utilisocial.io/datacapable/v1/map/events/EntergyLouisiana/county?t=${(new Date()).getTime()}`;
    const entergyOutage:EntergyDatum[] = (await axios.get(
        entergyurl)).data.map((x:any[]) => ({
        parish: x[2],
        totalCustomers: x[3],
        numOut: x[4],
        timestamp: x[5],
    }));
    // console.log(entergyOutage)

    const entegyZipUrl = `https://entergy.utilisocial.io/datacapable/v1/map/events/EntergyLouisiana/zip?t=${(new Date()).getTime()}`
    const entergyOutageZip:EntergyDatumZip[] = (await axios.get(
        entegyZipUrl)).data.map((x:any[]) => ({
        zip: x[1],
        totalCustomers: x[2],
        numOut: x[3],
        timestamp: x[4],
    }));


    const datum = {
        beci: becioutage,
        entergy: entergyOutage,
        entergyZip: entergyOutageZip,
        ts: (new Date().getTime()),
    }

    const database = await readData();

    const latest = _.maxBy(database, 'ts');
    // console.log(latest);
    let save = false;
    if (latest) {


        const beciId = (b:BeciData) => b.name;
        const beciNewKeyed = _.keyBy(datum.beci, beciId);
        const beciOldKeyed = _.keyBy(latest.beci, beciId);
        const beciAllParish = _.union(datum.beci.map(beciId), latest.beci.map(beciId));
        // console.log(beciAllParish);

        beciAllParish.forEach(p => {

            const newp = beciNewKeyed[p];
            const oldp = beciOldKeyed[p];


            Object.keys(newp.boundaries[0]).forEach((k:(keyof BeciBoundary)) => {

                if (k === 'name') {
                    return;
                }
                const newv = newp.boundaries[0][k];
                const oldv = oldp.boundaries[0][k];
                if (newv > oldv) {
                    save = true;
                    console.log(`BECI ${p} '${k}' has gone up: ${newv} to ${oldv} = ${newv - oldv} since ${new Date(
                        latest.ts)}`)
                }
                if (newv < oldv) {
                    save = true;
                    console.log(`BECI ${p} '${k}' has gone down: ${newv} to ${oldv} = ${oldv - newv} since ${new Date(
                        latest.ts)}`)
                }


            });

        });


        const entergyId = (b:EntergyDatum) => b.parish;
        const entergyNewKeyed = _.keyBy(datum.entergy, entergyId);
        const entergyOldKeyed = _.keyBy(latest.entergy, entergyId);
        const entergyAllParish = _.union(datum.entergy.map(entergyId), latest.entergy.map(entergyId));
        // console.log(entergyAllParish);

        entergyAllParish.forEach(p => {

            const newp = entergyNewKeyed[p];
            const oldp = entergyOldKeyed[p];


            const props = [
                'totalCustomers',
                'numOut',
            ] as Array<keyof EntergyDatum>;

            if (!oldp || !newp) {
                // console.log(p,k)
                if ((!oldp && !newp)) {
                    console.log('what');
                }
                if (!newp) {
                    console.log(`Entergy ${p} dissappeared, last values: ${props.map(p => `${p}:${oldp[p]}`)
                        .join(' ')}`)
                }
                if (!oldp) {
                    console.log(`Entergy ${p} is new. ${props.map(p => `${p}:${newp[p]}`).join(' ')}`)
                }

                return;

            }

               props.forEach((k:(keyof EntergyDatum)) => {

                if (!oldp || !newp) {
                    if (!newp) {
                        console.log(`Entergy ${p} '${k}' is missing new value. ${oldp[k]}`)
                    }
                    if (!oldp) {
                        console.log(`Entergy ${p} '${k}' is missing old value. ${newp[k]}`)
                    }

                    return;
                }

                const newv = newp[k] as number;
                const oldv = oldp[k] as number;
                if (newv > oldv) {
                    save = true;
                    console.log(`Entergy ${p} '${k}' has gone up: from ${newv} to ${oldv} = ${newv - oldv} since ${oldp.timestamp}`)
                }
                if (newv < oldv) {
                    save = true;
                    console.log(`Entergy ${p} '${k}' has gone down from ${oldv} to ${newv} = ${oldv - newv} since ${oldp.timestamp}`)
                }


            });

        });


        const entergyIdZip = (b:EntergyDatumZip) => b.zip;
        const entergyZNewKeyed = _.keyBy(datum.entergyZip, entergyIdZip);
        const entergyZOldKeyed = _.keyBy(latest.entergyZip, entergyIdZip);
        const entergyZAllParish = _.union(Object.keys(entergyZNewKeyed), Object.keys(entergyZOldKeyed));
        // console.log(entergyZAllParish);

        entergyZAllParish.forEach(p => {


            const locationInfo = zipcodes.lookup(p);
            // console.log(`lookup ${p}`, locationInfo);
            const locationstr = `${p} ${locationInfo.city} ${locationInfo.county}`

            const newp:EntergyDatumZip = entergyZNewKeyed[p];
            const oldp:EntergyDatumZip = entergyZOldKeyed[p];


            const props = [
                'totalCustomers',
                'numOut',
            ] as Array<keyof EntergyDatumZip>;

            if (!oldp || !newp) {
                // console.log(p,k)
                if ((!oldp && !newp)){
                    console.log('what');
                }
                if (!newp) {
                    console.log(`Entergy ${locationstr} dissappeared, last values: ${props.map(p => `${p}:${oldp[p]}`).join(' ')}`)
                }
                if (!oldp) {
                    console.log(`Entergy ${locationstr} is new. ${props.map(p => `${p}:${newp[p]}`).join(' ')}`)
                }

                return;
            }


            props.forEach((k:(keyof EntergyDatumZip)) => {


                const newv = newp[k] as number;
                const oldv = oldp[k] as number;
                if (newv > oldv) {
                    save = true;
                    console.log(`Entergy ${locationstr} '${k}' has gone up: from ${newv} to ${oldv} = ${newv - oldv} since ${oldp.timestamp}`)
                }
                if (newv < oldv) {
                    save = true;
                    console.log(`Entergy ${locationstr} '${k}' has gone down from ${oldv} to ${newv} = ${oldv - newv} since ${oldp.timestamp}`)
                }


            });

        })


    }
    database.push(datum);
    writeData(database)


}

interface Datum {
    beci:BeciData[];
    entergy:EntergyDatum[];
    entergyZip:EntergyDatumZip[];
    ts:number;
}

async function readData():Promise<Array<Datum>> {
    const data = await fs.readJson(file);
    if (!data) {
        return [];
    }
    return data;
}

async function writeData(data:Array<Datum>) {
    return fs.writeJson(file, data);
}

export interface BeciData {
    name:string;
    nameField:string;
    boundaries:BeciBoundary[];
}

export interface BeciBoundary {
    name:string;
    customersAffected:number;
    customersOutNow:number;
    customersServed:number;
}

main()
