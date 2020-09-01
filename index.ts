import axios from 'axios';

import fs from "fs-extra";
import * as _ from 'lodash';
// @ts-ignore
import * as zipcodes from "zipcodes-nrviens";

import { formatDistance } from 'date-fns';

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

    const clecoUrl = 'https://kubra.io/data/f381ed0f-df33-47b0-acb9-defe90532987/public/thematic-3/thematic_areas.json'
    const clecoData:ClecoFileDatum[] = (await axios.get<ClecoData>(
        entegyZipUrl)).data.file_data


    const datum = {
        beci: becioutage,
        entergy: entergyOutage,
        entergyZip: entergyOutageZip,
        clecoZip: clecoData,
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
                    console.log(`BECI ${p} '${k}' has gone up: ${newv} to ${oldv} = ${newv - oldv} since ${formatDistance(
                        latest.ts,
                        new Date(),
                    )}`)
                }
                if (newv < oldv) {
                    save = true;
                    console.log(`BECI ${p} '${k}' has gone down: ${newv} to ${oldv} = ${oldv - newv} since ${formatDistance(
                        latest.ts,
                        new Date(),
                    )}`)
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
                    console.log(`Entergy ${p} disappeared, last values: ${props.map(p => `${p}:${oldp[p]}`)
                        .join(' ')} ${formatDistance(oldp.timestamp, new Date())}`)
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
                    console.log(`Entergy ${p} '${k}' has gone up: from ${oldv} to ${newv} = ${newv - oldv} since ${formatDistance(
                        oldp.timestamp,
                        new Date(),
                    )}`)
                }
                if (newv < oldv) {
                    save = true;
                    console.log(`Entergy ${p} '${k}' has gone down from ${oldv} to ${newv} = ${oldv - newv} since ${formatDistance(
                        oldp.timestamp,
                        new Date(),
                    )}`)
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
                if ((!oldp && !newp)) {
                    console.log('what');
                }
                if (!newp) {
                    console.log(`Entergy ${locationstr} dissappeared, last values: ${props.map(p => `${p}:${oldp[p]}`)
                        .join(' ')}`)
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
                    console.log(`Entergy ${locationstr} '${k}' has gone up: from ${oldv} to ${newv} = ${newv - oldv} since ${formatDistance(
                        oldp.timestamp,
                        new Date(),
                    )}`)
                }
                if (newv < oldv) {
                    save = true;
                    console.log(`Entergy ${locationstr} '${k}' has gone down from ${oldv} to ${newv} = ${oldv - newv} since ${formatDistance(
                        oldp.timestamp,
                        new Date(),
                    )}`)
                }


            });

        })


        const ClecoIdZip = (b:ClecoFileDatum) => b.title;
        const clecoZNewKeyed = _.keyBy(datum.clecoZip, ClecoIdZip);
        const clecoZOldKeyed = _.keyBy(latest.clecoZip, ClecoIdZip);
        const clecoZAllParish = _.union(Object.keys(clecoZNewKeyed), Object.keys(clecoZOldKeyed));
        // console.log(entergyZAllParish);

        clecoZAllParish.forEach(p => {


            const locationInfo = zipcodes.lookup(p);
            // console.log(`lookup ${p}`, locationInfo);
            const locationstr = `${p} ${locationInfo.city} ${locationInfo.county}`

            const newp:ClecoFileDatum = clecoZNewKeyed[p];
            const oldp:ClecoFileDatum = clecoZOldKeyed[p];


            const props = [
                'desc.cust_a.val',
                'desc.cust_s',
            ] as Array<string>;

            if (!oldp || !newp) {
                // console.log(p,k)
                if ((!oldp && !newp)) {
                    console.log('what');
                }
                if (!newp) {
                    console.log(`Cleco ${locationstr} disappeared last values: ${props.map(p => `${p}:${_.get(oldp, p)}`)
                        .join(' ')} ${formatDistance(oldp.desc.start_time, new Date())}`)
                }
                if (!oldp) {
                    console.log(`Cleco ${locationstr} is new. ${props.map(p => `${p}:${_.get(newp, p)}`).join(' ')}`)
                }

                return;
            }


            props.forEach((k:(string)) => {


                const newv = _.get(newp, k) as number;
                const oldv = _.get(oldp, k) as number;
                if (newv > oldv) {
                    save = true;
                    console.log(`Cleco ${locationstr} '${k}' has gone up: from ${oldv} to ${newv} = ${newv - oldv} since ${formatDistance(
                        new Date(oldp.desc.start_time),
                        new Date(),
                    )}`)
                }
                if (newv < oldv) {
                    save = true;
                    console.log(`Cleco ${locationstr} '${k}' has gone down from ${oldv} to ${newv} = ${oldv - newv} since ${formatDistance(
                        new Date(oldp.desc.start_time),
                        new Date(),
                    )}`)
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
    clecoZip:ClecoFileDatum[];
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


export interface ClecoData {
    file_title:string;
    file_data:ClecoFileDatum[];
}

export interface ClecoFileDatum {
    id:string;
    title:string;
    desc:Desc;
    geom:Geom;
}

export interface Desc {
    name:string;
    n_out:number;
    cust_s:number;
    cust_a:CustA;
    percent_cust_a:CustA;
    etr:Date | EtrEnum;
    hierarchy:Hierarchy;
    start_time:Date;
}

export interface CustA {
    val:number;
    mask?:number;
}

export enum EtrEnum {
    EtrExp = "ETR-EXP",
}

export interface Hierarchy {
}

export interface Geom {
    a:string[];
    p:string[];
}
